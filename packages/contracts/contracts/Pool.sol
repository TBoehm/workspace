// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

interface YearnVault is IERC20 {
  function token() external view returns (address);
  function deposit(uint256 amount) external returns (uint256);
  function withdraw(uint256 amount) external returns (uint256);
  function pricePerShare() external view returns (uint256);
}

interface CurveDepositZap {
  function add_liquidity(uint256[4] calldata amounts, uint256 min_mint_amounts) external returns (uint256);
  function remove_liquidity_one_coin(uint256 amount, int128 i, uint256 min_underlying_amount) external returns (uint256);
}

interface DAI is IERC20 {}

interface CrvLPToken is IERC20 {}

contract Pool is ERC20 {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  DAI public dai;
  CrvLPToken public crvLPToken;
  YearnVault public yearnVault;
  CurveDepositZap public curveDepositZap;
  address public rewardsManager;

  uint256 WITHDRAWAL_FEE_BPS = 50;
  uint256 BPS_DENOMINATOR = 10000;
  uint256 YEARN_PRECISION = 10 ** 18;

  uint256 public deployedAt;
  uint256 public lastReport;
  uint256 public gain;
  uint256 public loss;

  event Deposit(address from, uint256 amount);
  event Withdrawal(address to, uint256 amount);
  event WithdrawalFee(address to, uint256 amount);

  constructor(
    DAI dai_,
    CrvLPToken crvLPToken_,
    YearnVault yearnVault_,
    CurveDepositZap curveDepositZap_,
    address rewardsManager_
  ) ERC20("Popcorn DAI Pool", "popDAI") {
    dai = dai_;
    crvLPToken = crvLPToken_;
    yearnVault = yearnVault_;
    curveDepositZap = curveDepositZap_;
    rewardsManager = rewardsManager_;
    deployedAt = block.number;
    lastReport = block.number;
    gain = 0;
    loss = 0;
  }

  function totalAssets() external view returns (uint256) {
    uint256 yearnBalance = yearnVault.balanceOf(address(this));
    return yearnVault.pricePerShare() * yearnBalance / 10 ** 18;
  }

  function deposit(uint256 amount) external returns (uint256) {
    _mint(msg.sender, amount);
    emit Deposit(msg.sender, amount);

    dai.transferFrom(msg.sender, address(this), amount);
    uint256 crvLPTokenAmount = _sendToCurve(amount);
    uint256 yvShareAmount = _sendToYearn(crvLPTokenAmount);

    return this.balanceOf(msg.sender);
  }

  function withdraw(uint256 amount) external returns (uint256 withdrawalAmount, uint256 feeAmount) {
    assert(amount <= this.balanceOf(msg.sender));

    uint256 yvShareWithdrawal = _yearnSharesFor(amount);

    _burn(msg.sender, amount);

    uint256 crvLPTokenAmount = _withdrawFromYearn(yvShareWithdrawal);
    uint256 daiAmount = _withdrawFromCurve(crvLPTokenAmount);

    uint256 fee = _calculateWithdrawalFee(daiAmount);
    uint256 withdrawal = daiAmount - fee;
    _transferWithdrawalFee(fee);
    _transferWithdrawal(withdrawal);

    return (withdrawal, fee);
  }

  function _sendToCurve(uint256 amount) internal returns (uint256 crvLPTokenAmount) {
    dai.approve(address(curveDepositZap), amount);
    uint256[4] memory curveDepositAmounts = [
      0,      // USDX
      amount, // DAI
      0,      // USDC
      0       // USDT
    ];
    return curveDepositZap.add_liquidity(curveDepositAmounts, 0);
  }

  function _sendToYearn(uint256 amount) internal returns (uint256 yvShareAmount) {
    crvLPToken.approve(address(yearnVault), amount);
    return yearnVault.deposit(amount);
  }


  function _yearnSharesFor(uint256 poolTokenAmount) internal view returns (uint256){
    uint256 yearnBalance = yearnVault.balanceOf(address(this));
    uint256 share = poolTokenAmount * 10 ** 18 / this.totalSupply();
    return yearnBalance * share / 10 ** 18;
  }

  function _withdrawFromYearn(uint256 yvShares) internal returns (uint256) {
    return yearnVault.withdraw(yvShares);
  }

  function _withdrawFromCurve(uint256 crvLPTokenAmount) internal returns (uint256) {
    crvLPToken.approve(address(curveDepositZap), crvLPTokenAmount);
    return curveDepositZap.remove_liquidity_one_coin(crvLPTokenAmount, 1, 0);
  }

  function _calculateWithdrawalFee(uint256 withdrawalAmount) internal view returns (uint256) {
    return withdrawalAmount * WITHDRAWAL_FEE_BPS / BPS_DENOMINATOR;
  }

  function _transferWithdrawalFee(uint256 withdrawalFee) internal {
    _transferDai(rewardsManager, withdrawalFee);
    emit WithdrawalFee(rewardsManager, withdrawalFee);
  }

  function _transferWithdrawal(uint256 withdrawal) internal {
    _transferDai(msg.sender, withdrawal);
    emit Withdrawal(msg.sender, withdrawal);
  }

  function _transferDai(address to, uint256 amount) internal {
    dai.approve(address(this), amount);
    dai.transferFrom(address(this), to, amount);
  }
}
