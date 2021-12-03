// SPDX-License-Identifier: MIT

// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BatchType, Batch, IHysiBatchInteraction} from "../../interfaces/IHysiBatchInteraction.sol";
import "../../../externals/interfaces/Curve3Pool.sol";
import "../../interfaces/IContractRegistry.sol";

/*
This Contract allows user to use and receive stablecoins directly when interacting with HysiBatchInteraction.
This contract mainly takes stablecoins swaps them into 3CRV and deposits them or the other way around.
 */
contract HysiBatchZapper {
  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */

  IContractRegistry private contractRegistry;
  Curve3Pool private curve3Pool;
  IERC20 private threeCrv;

  /* ========== EVENTS ========== */

  event ZappedIntoBatch(uint256 threeCurveAmount, address account);
  event ZappedOutOfBatch(
    bytes32 batchId,
    uint8 stableCoinIndex,
    uint256 threeCurveAmount,
    uint256 stableCoinAmount,
    address account
  );
  event ClaimedIntoStable(
    bytes32 batchId,
    uint8 stableCoinIndex,
    uint256 threeCurveAmount,
    uint256 stableCoinAmount,
    address account
  );

  /* ========== CONSTRUCTOR ========== */

  constructor(
    IContractRegistry _contractRegistry,
    Curve3Pool _curve3Pool,
    IERC20 _threeCrv
  ) {
    contractRegistry = _contractRegistry;
    curve3Pool = _curve3Pool;
    threeCrv = _threeCrv;
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  /**
   * @notice zapIntoBatch allows a user to deposit into a mintBatch directly with stablecoins
   * @param _amounts An array of amounts in stablecoins the user wants to deposit
   * @param _min_mint_amounts The min amount of 3CRV which should be minted by the curve three-pool (slippage control)
   * @dev The amounts in _amounts must align with their index in the curve three-pool
   */
  function zapIntoBatch(uint256[3] memory _amounts, uint256 _min_mint_amounts)
    external
  {
    address hysiBatchInteraction = contractRegistry.getContract(
      keccak256("HysiBatchInteraction")
    );
    for (uint8 i; i < _amounts.length; i++) {
      if (_amounts[i] > 0) {
        //Deposit Stables
        IERC20(curve3Pool.coins(i)).safeTransferFrom(
          msg.sender,
          address(this),
          _amounts[i]
        );
        //Allow Stables for user in curve three-pool
        IERC20(curve3Pool.coins(i)).safeIncreaseAllowance(
          address(curve3Pool),
          _amounts[i]
        );
      }
    }
    //Deposit stables to receive 3CRV
    curve3Pool.add_liquidity(_amounts, _min_mint_amounts);

    //Check the amount of returned 3CRV
    /*
    While curves metapools return the amount of minted 3CRV this is not possible with the three-pool which is why we simply have to check our balance after depositing our stables.
    If a user sends 3CRV to this contract by accident (Which cant be retrieved anyway) they will be used aswell.
    */
    uint256 threeCrvAmount = threeCrv.balanceOf(address(this));

    //Allow hysiBatchInteraction to use 3CRV
    threeCrv.safeIncreaseAllowance(hysiBatchInteraction, threeCrvAmount);

    //Deposit 3CRV in current mint batch
    IHysiBatchInteraction(hysiBatchInteraction).depositForMint(
      threeCrvAmount,
      msg.sender
    );
    emit ZappedIntoBatch(threeCrvAmount, msg.sender);
  }

  /**
   * @notice zapOutOfBatch allows a user to retrieve their not yet processed 3CRV and directly receive stablecoins
   * @param _batchId Defines which batch gets withdrawn from
   * @param _amountToWithdraw 3CRV amount that shall be withdrawn
   * @param _stableCoinIndex Defines which stablecoin the user wants to receive
   * @param _min_amount The min amount of stables which should be returned by the curve three-pool (slippage control)
   * @dev The _stableCoinIndex must align with the index in the curve three-pool
   */
  function zapOutOfBatch(
    bytes32 _batchId,
    uint256 _amountToWithdraw,
    uint8 _stableCoinIndex,
    uint256 _min_amount
  ) external {
    // Allows the zapepr to withdraw 3CRV from batch for the user
    IHysiBatchInteraction(
      contractRegistry.getContract(keccak256("HysiBatchInteraction"))
    ).withdrawFromBatch(_batchId, _amountToWithdraw, msg.sender);

    //Burns 3CRV for stables and sends them to the user
    //stableBalance is only returned for the event
    uint256 stableBalance = _swapAndTransfer3Crv(
      _amountToWithdraw,
      _stableCoinIndex,
      _min_amount
    );

    emit ZappedOutOfBatch(
      _batchId,
      _stableCoinIndex,
      _amountToWithdraw,
      stableBalance,
      msg.sender
    );
  }

  /**
   * @notice claimAndSwapToStable allows a user to claim their processed 3CRV from a redeemBatch and directly receive stablecoins
   * @param _batchId Defines which batch gets withdrawn from
   * @param _stableCoinIndex Defines which stablecoin the user wants to receive
   * @param _min_amount The min amount of stables which should be returned by the curve three-pool (slippage control)
   * @dev The _stableCoinIndex must align with the index in the curve three-pool
   */
  function claimAndSwapToStable(
    bytes32 _batchId,
    uint8 _stableCoinIndex,
    uint256 _min_amount
  ) external {
    //We can only deposit 3CRV which come from mintBatches otherwise this could claim HYSI which we cant process here
    IHysiBatchInteraction hysiBatchInteraction = IHysiBatchInteraction(
      contractRegistry.getContract(keccak256("HysiBatchInteraction"))
    );
    require(
      hysiBatchInteraction.batches(_batchId).batchType == BatchType.Redeem,
      "needs to return 3crv"
    );

    //Zapper claims 3CRV for the user
    uint256 threeCurveAmount = hysiBatchInteraction.claim(_batchId, msg.sender);

    //Burns 3CRV for stables and sends them to the user
    //stableBalance is only returned for the event
    uint256 stableBalance = _swapAndTransfer3Crv(
      threeCurveAmount,
      _stableCoinIndex,
      _min_amount
    );

    emit ClaimedIntoStable(
      _batchId,
      _stableCoinIndex,
      threeCurveAmount,
      stableBalance,
      msg.sender
    );
  }

  /**
   * @notice _swapAndTransfer3Crv burns 3CRV and sends the returned stables to the user
   * @param _threeCurveAmount How many 3CRV shall be burned
   * @param _stableCoinIndex Defines which stablecoin the user wants to receive
   * @param _min_amount The min amount of stables which should be returned by the curve three-pool (slippage control)
   * @dev The stableCoinIndex_ must align with the index in the curve three-pool
   */
  function _swapAndTransfer3Crv(
    uint256 _threeCurveAmount,
    uint8 _stableCoinIndex,
    uint256 _min_amount
  ) internal returns (uint256) {
    //Allow curve three-pool to use 3CRV
    threeCrv.safeIncreaseAllowance(address(curve3Pool), _threeCurveAmount);

    //Burn 3CRV to receive stables
    curve3Pool.remove_liquidity_one_coin(
      _threeCurveAmount,
      _stableCoinIndex,
      _min_amount
    );

    //Check the amount of returned stables
    /*
    If a user sends Stables to this contract by accident (Which cant be retrieved anyway) they will be used aswell.
    */
    uint256 stableBalance = IERC20(curve3Pool.coins(_stableCoinIndex))
      .balanceOf(address(this));

    //Transfer stables to user
    IERC20(curve3Pool.coins(_stableCoinIndex)).safeTransfer(
      msg.sender,
      stableBalance
    );

    //Return stablebalance for event
    return stableBalance;
  }
}
