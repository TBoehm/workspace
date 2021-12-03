// SPDX-License-Identifier: MIT
// Docgen-SOLC: 0.8.0
pragma solidity >=0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./AffiliateToken.sol";
import "../../interfaces/IERC20Metadata.sol";
import "../../interfaces/IACLRegistry.sol";
import "../../interfaces/IContractRegistry.sol";

contract Pool is AffiliateToken, ReentrancyGuard, Pausable {
  using SafeMath for uint256;

  IContractRegistry public contractRegistry;

  uint256 constant BPS_DENOMINATOR = 10_000;
  uint256 constant MINUTES_PER_YEAR = 525_600;

  uint256 public withdrawalFee = 50;
  uint256 public managementFee = 200;
  uint256 public performanceFee = 2000;
  uint256 public poolTokenHWM = 1e18;
  uint256 public feesUpdatedAt;

  mapping(address => uint256) public blockLocks;

  event Deposit(address indexed from, uint256 deposit, uint256 poolTokens);
  event Withdrawal(address indexed to, uint256 amount);
  event WithdrawalFee(address indexed to, uint256 amount);
  event PerformanceFee(uint256 amount);
  event ManagementFee(uint256 amount);
  event WithdrawalFeeChanged(uint256 previousBps, uint256 newBps);
  event ManagementFeeChanged(uint256 previousBps, uint256 newBps);
  event PerformanceFeeChanged(uint256 previousBps, uint256 newBps);

  constructor(
    address _token,
    address _yearnRegistry,
    IContractRegistry _contractRegistry
  )
    public
    AffiliateToken(
      _token,
      _yearnRegistry,
      string(
        abi.encodePacked("Popcorn ", IERC20Metadata(_token).name(), " Pool")
      ),
      string(abi.encodePacked("pop", IERC20Metadata(_token).symbol()))
    )
  {
    require(address(_yearnRegistry) != address(0), "Zero address");
    require(address(_contractRegistry) != address(0), "Zero address");

    contractRegistry = _contractRegistry;
    feesUpdatedAt = block.timestamp;
  }

  modifier blockLocked() {
    require(blockLocks[msg.sender] < block.number, "Locked until next block");
    _;
  }

  /**
   * @notice Deposit `_amount` of tokens, issuing pool tokens to caller.
   * @param _amount Quantity of tokens to deposit.
   * @return Quantity of pool tokens issued to caller.
   */
  function deposit(uint256 _amount)
    public
    override
    nonReentrant
    whenNotPaused
    blockLocked
    returns (uint256)
  {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireApprovedContractOrEOA(msg.sender);
    return _depositFor(_amount, msg.sender);
  }

  /**
   * @notice Deposit `_amount` of tokens, issuing pool tokens to `_recipient`.
   * @param _amount Quantity of tokens to deposit.
   * @param _recipient Recipient of issued pool tokens.
   * @return Quantity of pool tokens issued to recipient.
   */
  function depositFor(uint256 _amount, address _recipient)
    public
    nonReentrant
    whenNotPaused
    blockLocked
    returns (uint256)
  {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireApprovedContractOrEOA(msg.sender);
    return _depositFor(_amount, _recipient);
  }

  /**
   * @notice Exchange `_amount` of pool tokens for underlying tokens, sending underlying tokens to caller.
   * @param _amount Quantity of pool tokens to exchange for underlying tokens.
   * @return Quantity of underlying tokens sent to caller.
   */
  function withdraw(uint256 _amount)
    public
    override
    nonReentrant
    blockLocked
    returns (uint256)
  {
    require(
      _amount <= balanceOf(msg.sender),
      "Insufficient pool token balance"
    );

    _lockForBlock(msg.sender);
    _takeFees();

    uint256 feeShares = _calculateWithdrawalFee(_amount);
    uint256 withdrawalShares = _amount.sub(feeShares);
    uint256 fee = valueFor(feeShares);
    uint256 withdrawal = valueFor(withdrawalShares);
    address rewardsManager = contractRegistry.getContract(
      keccak256("RewardsManager")
    );

    _burn(msg.sender, _amount);
    _withdraw(address(this), msg.sender, withdrawal, true);
    _withdraw(address(this), rewardsManager, fee, true);

    emit WithdrawalFee(rewardsManager, fee);
    emit Withdrawal(msg.sender, withdrawal);

    _reportPoolTokenHWM();

    return withdrawal;
  }

  /**
   * @notice Transfer `_amount` of pool tokens from caller's address to `_recipient` address.
   * @param _recipient Address pool tokens are being transferred to. Must not be this contract's address or 0x0.
   * @param _amount Quantity of pool tokens to transfer to `_recipient`.
   * @return True if transfer is sent to an address other than this contract's or 0x0, otherwise the transaction will fail.
   */
  function transfer(address _recipient, uint256 _amount)
    public
    override
    blockLocked
    returns (bool)
  {
    return super.transfer(_recipient, _amount);
  }

  /**
   * @notice Transfer `_amount` of pool tokens from `_sender` address to `_recipient` address.
   * @param _sender Address pool tokens are being transferred from.
   * @param _recipient Address pool tokens are being transferred to. Must not be this contract's address or 0x0.
   * @param _amount Quantity of pool tokens to transfer.
   * @return True if transfer is sent to an address other than this contract's or 0x0, otherwise the transaction will fail.
   */
  function transferFrom(
    address _sender,
    address _recipient,
    uint256 _amount
  ) public override blockLocked returns (bool) {
    return super.transferFrom(_sender, _recipient, _amount);
  }

  /**
   * @notice Collect management and performance fees and update pool token high water mark.
   */
  function takeFees() external nonReentrant {
    _takeFees();
    _reportPoolTokenHWM();
  }

  /**
   * @notice Set `withdrawalFee` in BPS. Caller must be authorized by ACL registry.
   * @param _withdrawalFee New `withdrawalFee` in BPS.
   * @dev Value is in basis points, i.e. 100 BPS = 1%
   */
  function setWithdrawalFee(uint256 _withdrawalFee) external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    require(withdrawalFee != _withdrawalFee, "Same withdrawalFee");
    uint256 previousWithdrawalFee = withdrawalFee;
    withdrawalFee = _withdrawalFee;
    emit WithdrawalFeeChanged(previousWithdrawalFee, withdrawalFee);
  }

  /**
   * @notice Set `managementFee` in BPS. Caller must be authorized by ACL registry.
   * @param _managementFee New `managementFee` in BPS.
   * @dev Value is in basis points, i.e. 100 BPS = 1%
   */
  function setManagementFee(uint256 _managementFee) external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    require(managementFee != _managementFee, "Same managementFee");
    uint256 previousManagementFee = managementFee;
    managementFee = _managementFee;
    emit ManagementFeeChanged(previousManagementFee, managementFee);
  }

  /**
   * @notice Set `performanceFee` in BPS. Caller must be authorized by ACL registry.
   * @param _performanceFee New `performanceFee` in BPS.
   * @dev Value is in basis points, i.e. 100 BPS = 1%
   */
  function setPerformanceFee(uint256 _performanceFee) external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    require(performanceFee != _performanceFee, "Same performanceFee");
    uint256 previousPerformanceFee = performanceFee;
    performanceFee = _performanceFee;
    emit PerformanceFeeChanged(previousPerformanceFee, performanceFee);
  }

  /**
   * @notice Transfer accrued fees to rewards manager contract. Caller must be authorized by ACL registry.
   */
  function withdrawAccruedFees() external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    uint256 balance = balanceOf(address(this));
    _burn(address(this), balance);
    _withdraw(
      address(this),
      contractRegistry.getContract(keccak256("RewardsManager")),
      valueFor(balance),
      true
    );
  }

  /**
   * @notice Pause deposits. Caller must be authorized by ACL registry.
   */
  function pauseContract() external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    _pause();
  }

  /**
   * @notice Unpause deposits. Caller must be authorized by ACL registry.
   */
  function unpauseContract() external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    _unpause();
  }

  /**
   * @notice Returns price per pool token in underlying token.
   * @return Price per pool token in underlying token.
   * @dev Pool tokens are denominated with 18 decimals. Return value based on underlying token's decimals.
   */
  function pricePerPoolToken() public view returns (uint256) {
    return valueFor(1e18);
  }

  /**
   * @notice Returns total value of pool deposits in underlying token.
   * @return Total value of pool deposits in underlying token.
   * @dev Return value is denominated in underlying token.
   */
  function totalValue() public view returns (uint256) {
    return totalVaultBalance(address(this));
  }

  /**
   * @notice Returns value of `_amount` of pool tokens in underlying tokens.
   * @return Value of `_amount` of pool tokens in underlying token.
   * @dev Return value is denominated in underlying token.
   */
  function valueFor(uint256 _amount) public view returns (uint256) {
    return _shareValue(_amount);
  }

  function _depositFor(uint256 _amount, address _recipient)
    internal
    returns (uint256)
  {
    require(_amount <= token.balanceOf(msg.sender), "Insufficient balance");
    _lockForBlock(msg.sender);
    _takeFees();

    uint256 deposited = _deposit(msg.sender, address(this), _amount, true);
    uint256 shares = _sharesForValue(deposited);
    _mint(_recipient, shares);

    emit Deposit(_recipient, _amount, shares);
    _reportPoolTokenHWM();
    return shares;
  }

  function _reportPoolTokenHWM() internal {
    if (pricePerPoolToken() > poolTokenHWM) {
      poolTokenHWM = pricePerPoolToken();
    }
  }

  function _issuePoolTokensForAmount(address _to, uint256 _amount)
    internal
    returns (uint256)
  {
    uint256 tokens = _sharesForValue(_amount);
    return _issuePoolTokens(_to, tokens);
  }

  function _takeManagementFee() internal {
    uint256 period = block.timestamp.sub(feesUpdatedAt).div(1 minutes);
    uint256 fee = (managementFee.mul(totalValue()).mul(period)).div(
      MINUTES_PER_YEAR.mul(BPS_DENOMINATOR)
    );
    if (fee > 0) {
      _issuePoolTokensForAmount(address(this), fee);
      emit ManagementFee(fee);
    }
  }

  function _takePerformanceFee() internal {
    if (pricePerPoolToken() > poolTokenHWM) {
      uint256 changeInPricePerToken = pricePerPoolToken().sub(poolTokenHWM);
      uint256 fee = performanceFee
        .mul(changeInPricePerToken)
        .mul(totalSupply())
        .div(BPS_DENOMINATOR)
        .div(1e18);
      _issuePoolTokensForAmount(address(this), fee);
      emit PerformanceFee(fee);
    }
  }

  function _takeFees() internal {
    _takeManagementFee();
    _takePerformanceFee();
    feesUpdatedAt = block.timestamp;
  }

  function _calculateWithdrawalFee(uint256 _withdrawalAmount)
    internal
    view
    returns (uint256)
  {
    return _withdrawalAmount.mul(withdrawalFee).div(BPS_DENOMINATOR);
  }

  function _issuePoolTokens(address _to, uint256 _amount)
    internal
    returns (uint256)
  {
    _mint(_to, _amount);
    return _amount;
  }

  function _lockForBlock(address account) internal {
    blockLocks[account] = block.number;
  }
}
