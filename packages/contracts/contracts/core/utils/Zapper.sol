// SPDX-License-Identifier: MIT

// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IPool.sol";
import "../../externals/interfaces/CurveAddressProvider.sol";
import "../../externals/interfaces/CurveRegistry.sol";
import "../../externals/interfaces/CurveMetapool.sol";
import "../../externals/interfaces/Curve3Pool.sol";

contract Zapper {
  using SafeERC20 for IERC20;
  using SafeERC20 for IPool;

  CurveAddressProvider public curveAddressProvider;
  CurveRegistry public curveRegistry;

  event ZapIn(
    address account,
    address depositToken,
    uint256 depositAmount,
    uint256 shares
  );
  event ZapOut(
    address account,
    address withdrawalShares,
    uint256 shares,
    uint256 withdrawalAmount
  );

  constructor(address _curveAddressProvider) {
    curveAddressProvider = CurveAddressProvider(_curveAddressProvider);
    curveRegistry = CurveRegistry(curveAddressProvider.get_registry());
  }

  function token(address _popcornPool) public view returns (address) {
    return address(IPool(_popcornPool).token());
  }

  function curveMetapoolAddress(address _popcornPool)
    public
    view
    returns (address)
  {
    return curveRegistry.get_pool_from_lp_token(token(_popcornPool));
  }

  function curveBasepoolAddress(address _popcornPool)
    public
    view
    returns (address)
  {
    address basePoolLPToken = curveRegistry.get_coins(
      curveMetapoolAddress(_popcornPool)
    )[1];
    return curveRegistry.get_pool_from_lp_token(basePoolLPToken);
  }

  function supportedTokens(address _popcornPool)
    public
    view
    returns (address[8] memory)
  {
    return
      curveRegistry.get_underlying_coins(curveMetapoolAddress(_popcornPool));
  }

  function canZap(address _popcornPool, address tokenAddress)
    public
    view
    returns (bool)
  {
    require(address(tokenAddress) != address(0));
    return tokenIndex(_popcornPool, tokenAddress) != 8;
  }

  function tokenIndex(address _popcornPool, address tokenAddress)
    public
    view
    returns (uint8)
  {
    uint8 index = 8;
    address[8] memory supportedTokenAddresses = supportedTokens(_popcornPool);
    for (uint8 i = 0; i < supportedTokenAddresses.length; i++) {
      if (address(supportedTokenAddresses[i]) == address(tokenAddress)) {
        index = i;
        break;
      }
    }
    return index;
  }

  function zapIn(
    address _popcornPool,
    address depositToken,
    uint256 amount
  ) public returns (uint256) {
    require(canZap(_popcornPool, depositToken), "Unsupported token");

    IERC20(depositToken).safeTransferFrom(msg.sender, address(this), amount);

    uint256 lpTokens;
    if (tokenIndex(_popcornPool, depositToken) == 0) {
      IERC20(depositToken).safeIncreaseAllowance(
        curveMetapoolAddress(_popcornPool),
        amount
      );
      lpTokens = CurveMetapool(curveMetapoolAddress(_popcornPool))
        .add_liquidity([amount, 0], 0);
    } else {
      IERC20(depositToken).safeIncreaseAllowance(
        curveBasepoolAddress(_popcornPool),
        amount
      );
      uint256[3] memory amounts = [uint256(0), uint256(0), uint256(0)];
      amounts[tokenIndex(_popcornPool, depositToken) - 1] = amount;
      address threeCrv = curveRegistry.get_lp_token(
        curveBasepoolAddress(_popcornPool)
      );
      uint256 balanceBefore = IERC20(threeCrv).balanceOf(address(this));
      Curve3Pool(curveBasepoolAddress(_popcornPool)).add_liquidity(amounts, 0);
      uint256 balanceAfter = IERC20(threeCrv).balanceOf(address(this));
      uint256 threeCrvLPTokens = balanceAfter - balanceBefore;
      IERC20(threeCrv).safeIncreaseAllowance(
        curveMetapoolAddress(_popcornPool),
        threeCrvLPTokens
      );
      lpTokens = CurveMetapool(curveMetapoolAddress(_popcornPool))
        .add_liquidity([0, threeCrvLPTokens], 0);
    }
    IERC20(token(_popcornPool)).safeIncreaseAllowance(_popcornPool, lpTokens);
    uint256 shares = IPool(_popcornPool).depositFor(lpTokens, msg.sender);
    emit ZapIn(msg.sender, depositToken, amount, shares);
    return shares;
  }

  function zapOut(
    address _popcornPool,
    address withdrawalToken,
    uint256 amount
  ) public returns (uint256) {
    require(canZap(_popcornPool, withdrawalToken), "Unsupported token");

    IPool(_popcornPool).transferFrom(msg.sender, address(this), amount);
    uint256 lpTokens = IPool(_popcornPool).withdraw(amount);
    IERC20(token(_popcornPool)).safeIncreaseAllowance(
      curveMetapoolAddress(_popcornPool),
      lpTokens
    );

    uint256 withdrawal;
    if (tokenIndex(_popcornPool, withdrawalToken) == 0) {
      withdrawal = CurveMetapool(curveMetapoolAddress(_popcornPool))
        .remove_liquidity_one_coin(lpTokens, 0, 0);
    } else {
      uint256 threeCrvWithdrawal = CurveMetapool(
        curveMetapoolAddress(_popcornPool)
      ).remove_liquidity_one_coin(lpTokens, 1, 0);
      address threeCrv = curveRegistry.get_lp_token(
        curveBasepoolAddress(_popcornPool)
      );
      IERC20(threeCrv).safeIncreaseAllowance(
        curveBasepoolAddress(_popcornPool),
        threeCrvWithdrawal
      );
      int128 i = tokenIndex(_popcornPool, withdrawalToken) - 1;
      uint256 balanceBefore = IERC20(withdrawalToken).balanceOf(address(this));
      Curve3Pool(curveBasepoolAddress(_popcornPool)).remove_liquidity_one_coin(
        threeCrvWithdrawal,
        i,
        0
      );
      uint256 balanceAfter = IERC20(withdrawalToken).balanceOf(address(this));
      withdrawal = balanceAfter - balanceBefore;
    }
    IERC20(withdrawalToken).safeTransfer(msg.sender, withdrawal);
    emit ZapOut(msg.sender, withdrawalToken, amount, withdrawal);
    return withdrawal;
  }
}
