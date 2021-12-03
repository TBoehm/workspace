// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IStaking.sol";
import "../interfaces/IRewardsEscrow.sol";
import "../interfaces/IContractRegistry.sol";
import "../interfaces/IACLRegistry.sol";

contract RewardsEscrow is IRewardsEscrow, ReentrancyGuard {
  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */
  struct Escrow {
    uint256 start;
    uint256 end;
    uint256 balance;
    bool claimed;
  }

  IContractRegistry public contractRegistry;

  mapping(bytes32 => Escrow) public escrows;
  mapping(address => bytes32[]) public escrowIds;
  uint256 public escrowDuration = 90 days;
  uint256 public vestingCliff = 90 days;

  /* ========== EVENTS ========== */
  event Locked(address account, uint256 amount);
  event RewardsClaimed(address _account, uint256 amount);
  event EscrowDurationChanged(uint256 _escrowDuration);
  event VestingCliffChanged(uint256 _vestingCliff);

  /* ========== CONSTRUCTOR ========== */

  constructor(IContractRegistry _contractRegistry) {
    contractRegistry = _contractRegistry;
  }

  /* ========== VIEWS ========== */

  /**
   * @notice Returns the escrow status
   * @param _escrowId Bytes32
   */
  function isClaimable(bytes32 _escrowId) external view returns (bool) {
    return
      escrows[_escrowId].start <= block.timestamp &&
      escrows[_escrowId].start != 0 &&
      escrows[_escrowId].claimed == false;
  }

  /**
   * @notice Returns all escrowIds which an account has/had claims in
   * @param _account address
   */
  function getEscrowsByUser(address _account)
    external
    view
    returns (bytes32[] memory)
  {
    return escrowIds[_account];
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  /**
   * @notice Locks funds for escrow
   * @dev This creates a seperate escrow structure which can later be iterated upon to unlock the escrowed funds
   */
  function lock(address _account, uint256 _amount)
    external
    override
    nonReentrant
  {
    IERC20 POP = IERC20(contractRegistry.getContract(keccak256("POP")));
    require(
      msg.sender == contractRegistry.getContract(keccak256("Staking")),
      "you cant call this function"
    );
    require(_amount > 0, "amount must be greater than 0");
    require(POP.balanceOf(msg.sender) >= _amount, "insufficient balance");

    uint256 currentTime = block.timestamp;
    uint256 start = currentTime + vestingCliff;
    uint256 end = start + escrowDuration;
    bytes32 id = keccak256(abi.encodePacked(_account, _amount, currentTime));

    escrows[id] = Escrow({
      start: start,
      end: end,
      balance: _amount,
      claimed: false
    });
    escrowIds[_account].push(id);

    POP.safeTransferFrom(msg.sender, address(this), _amount);

    emit Locked(_account, _amount);
  }

  /**
   * @notice Claim vested funds in escrow
   * @dev Uses the escrowId at the specified index of escrowIds.
   * @dev This function is used when a user only wants to claim a specific escrowVault or if they decide the gas cost of claimRewards are to high for now.
   * @dev (lower cost but also lower reward)
   */
  function claimReward(bytes32 _escrowId) external nonReentrant {
    uint256 reward = _claimReward(msg.sender, _escrowId);
    require(reward > 0, "no rewards");

    IERC20(contractRegistry.getContract(keccak256("POP"))).safeTransfer(
      msg.sender,
      reward
    );

    emit RewardsClaimed(msg.sender, reward);
  }

  /**
   * @notice Claim rewards of a a number of escrows
   * @dev Uses the vaultIds at the specified indices of escrowIds.
   * @dev This function is used when a user only wants to claim multiple escrowVaults at once (probably most of the time)
   * @dev The array of indices is limited to 20 as we want to prevent gas overflow of looping through too many vaults
   * TODO the upper bound of indices that can be used should be calculated with a simulation
   */
  function claimRewards(bytes32[] calldata _escrowIds) external nonReentrant {
    require(_escrowIds.length <= 20, "claiming too many escrows");
    uint256 total;

    for (uint256 i = 0; i < _escrowIds.length; i++) {
      total = total + _claimReward(msg.sender, _escrowIds[i]);
    }
    require(total > 0, "no rewards");

    IERC20(contractRegistry.getContract(keccak256("POP"))).safeTransfer(
      msg.sender,
      total
    );

    emit RewardsClaimed(msg.sender, total);
  }

  /* ========== RESTRICTED FUNCTIONS ========== */

  function updateEscrowDuration(uint256 _escrowDuration) external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    escrowDuration = _escrowDuration;
    emit EscrowDurationChanged(_escrowDuration);
  }

  function updateCliff(uint256 _vestingCliff) external {
    IACLRegistry(contractRegistry.getContract(keccak256("ACLRegistry")))
      .requireRole(keccak256("DAO"), msg.sender);
    vestingCliff = _vestingCliff;
    emit VestingCliffChanged(_vestingCliff);
  }

  /**
   * @notice Underlying function to calculate the rewards that a user gets
   * @dev We dont want it to error when a vault is empty for the user as this would terminate the entire loop when used in claimRewards()
   * @dev It marks the escrow as claimed when the whole balance was claimed
   */
  function _claimReward(address _account, bytes32 _escrowId)
    internal
    returns (uint256)
  {
    Escrow storage escrow = escrows[_escrowId];
    if (escrow.start <= block.timestamp) {
      uint256 claimable = _getClaimableAmount(escrow);
      if (claimable == escrow.balance) {
        escrow.claimed = true;
      }
      return claimable;
    }
    return 0;
  }

  function _getClaimableAmount(Escrow memory _escrow)
    internal
    view
    returns (uint256)
  {
    if (_escrow.start == 0 || _escrow.end == 0) {
      return 0;
    }
    return
      Math.min(
        (_escrow.balance * (block.timestamp - _escrow.start)) /
          (_escrow.end - _escrow.start),
        _escrow.balance
      );
  }
}
