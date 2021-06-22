pragma solidity >=0.7.0 <=0.8.3;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./IStaking.sol";
import "./IBeneficiaryRegistry.sol";
import "./IBeneficiaryVaults.sol";
import "./Governed.sol";

contract GrantElections is Governed {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  struct Vote {
    address voter;
    address beneficiary;
    uint256 weight;
  }

  struct Election {
    Vote[] votes;
    mapping(address => bool) registeredBeneficiaries;
    mapping(address => bool) voters;
    address[] registeredBeneficiariesList;
    ElectionTerm electionTerm;
    ElectionState electionState;
    ElectionConfiguration electionConfiguration;
    uint256 startTime;
    bytes32 merkleRoot;
  }

  struct ElectionConfiguration {
    uint8 ranking;
    uint8 awardees;
    bool useChainLinkVRF;
    uint256 registrationPeriod;
    uint256 votingPeriod;
    uint256 cooldownPeriod;
    uint256 registrationBond;
    bool registrationBondRequired;
    uint256 finalizationIncentive;
  }

  enum ElectionTerm {Monthly, Quarterly, Yearly}
  enum ElectionState {
    Registration,
    Voting,
    Closed,
    FinalizationProposed,
    Finalized
  }

  /* ========== STATE VARIABLES ========== */

  IERC20 public immutable POP;
  IStaking staking;
  IBeneficiaryRegistry beneficiaryRegistry;
  IBeneficiaryVaults beneficiaryVaults;

  Election[] public elections;
  uint256[3] public activeElections;
  ElectionConfiguration[3] public electionDefaults;
  uint256 incentiveBudget;

  /* ========== EVENTS ========== */

  event BeneficiaryRegistered(address _beneficiary, uint256 _electionId);
  event UserVoted(address _user, ElectionTerm _term);
  event ElectionInitialized(ElectionTerm _term, uint256 _startTime);
  event FinalizationProposed(uint256 _electionId, bytes _merkleRoot);
  event ElectionFinalized(uint256 _electionId, bytes _merkleRoot);

  /* ========== CONSTRUCTOR ========== */

  constructor(
    IStaking _staking,
    IBeneficiaryRegistry _beneficiaryRegistry,
    IBeneficiaryVaults _beneficiaryVaults,
    IERC20 _pop,
    address _governance
  ) Governed(_governance) {
    staking = _staking;
    beneficiaryRegistry = _beneficiaryRegistry;
    beneficiaryVaults = _beneficiaryVaults;
    POP = _pop;
    _setDefaults();
  }

  /* ========== VIEWS ========== */

  function getElectionMetadata(uint256 _electionId)
    public
    view
    returns (
      Vote[] memory votes_,
      ElectionTerm term_,
      address[] memory registeredBeneficiaries_,
      ElectionState state_,
      uint8[2] memory awardeesRanking_,
      bool useChainLinkVRF_,
      uint256[3] memory periods_,
      uint256 startTime_,
      bool registrationBondRequired_,
      uint256 registrationBond_
    )
  {
    Election storage e = elections[_electionId];

    votes_ = e.votes;
    term_ = e.electionTerm;
    registeredBeneficiaries_ = e.registeredBeneficiariesList;
    state_ = e.electionState;
    awardeesRanking_ = [
      e.electionConfiguration.awardees,
      e.electionConfiguration.ranking
    ];
    useChainLinkVRF_ = e.electionConfiguration.useChainLinkVRF;
    periods_ = [
      e.electionConfiguration.cooldownPeriod,
      e.electionConfiguration.registrationPeriod,
      e.electionConfiguration.votingPeriod
    ];
    startTime_ = e.startTime;
    registrationBondRequired_ = e
      .electionConfiguration
      .registrationBondRequired;
    registrationBond_ = e.electionConfiguration.registrationBond;
  }

  function getRegisteredBeneficiaries(uint256 _electionId)
    public
    view
    returns (address[] memory beneficiaries)
  {
    return elections[_electionId].registeredBeneficiariesList;
  }

  function _isEligibleBeneficiary(address _beneficiary, uint256 _electionId)
    public
    view
    returns (bool)
  {
    return
      elections[_electionId].registeredBeneficiaries[_beneficiary] &&
      beneficiaryRegistry.beneficiaryExists(_beneficiary);
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  // todo: mint POP for caller to incentivize calling function
  // todo: use bonds to incentivize callers instead of minting
  function initialize(ElectionTerm _grantTerm) public {
    uint8 _term = uint8(_grantTerm);
    Election storage latestElection = elections[activeElections[_term]];

    require(
      latestElection.electionState == ElectionState.Closed,
      "election not yet closed"
    );
    require(
      latestElection.electionConfiguration.cooldownPeriod >=
        block.timestamp.sub(latestElection.startTime),
      "can't start new election, not enough time elapsed since last election"
    );

    uint256 electionId = elections.length;
    activeElections[_term] = electionId;

    elections.push();
    Election storage election = elections[electionId];
    election.electionConfiguration = electionDefaults[_term];
    election.electionState = ElectionState.Registration;
    election.electionTerm = _grantTerm;
    election.startTime = block.timestamp;

    emit ElectionInitialized(election.electionTerm, election.startTime);
  }

  /**
   * todo: check beneficiary not already registered for this election
   * todo: check beneficiary is not registered for another non-closed election
   * todo: check beneficiary is not currently awarded a grant
   * todo: add claimBond function for beneficiary to receive their bond after the election period has closed
   */
  function registerForElection(address _beneficiary, uint256 _electionId)
    public
  {
    Election storage _election = elections[_electionId];

    // todo: refresh election state & update tests
    // refreshElectionState(_term);

    require(
      _election.electionState == ElectionState.Registration,
      "election not open for registration"
    );
    require(
      beneficiaryRegistry.beneficiaryExists(_beneficiary),
      "address is not eligible for registration"
    );
    // todo: check beneficiary not already registered for election
    _collectRegistrationBond(_election);

    _election.registeredBeneficiaries[_beneficiary] = true;
    _election.registeredBeneficiariesList.push(_beneficiary);

    emit BeneficiaryRegistered(_beneficiary, _electionId);
  }

  function refreshElectionState(uint256 _electionId) public {
    Election storage election = elections[_electionId];
    if (
      block.timestamp >=
      election
        .startTime
        .add(election.electionConfiguration.registrationPeriod)
        .add(election.electionConfiguration.votingPeriod)
    ) {
      election.electionState = ElectionState.Closed;
    } else if (
      block.timestamp >=
      election.startTime.add(election.electionConfiguration.registrationPeriod)
    ) {
      election.electionState = ElectionState.Voting;
    } else if (block.timestamp >= election.startTime) {
      election.electionState = ElectionState.Registration;
    }
  }

  function vote(
    address[] memory _beneficiaries,
    uint256[] memory _voiceCredits,
    uint256 _electionId
  ) public {
    Election storage election = elections[_electionId];
    require(_beneficiaries.length <= 5, "too many beneficiaries");
    require(_voiceCredits.length <= 5, "too many votes");
    require(_voiceCredits.length > 0, "Voice credits are required");
    require(_beneficiaries.length > 0, "Beneficiaries are required");
    refreshElectionState(_electionId);
    require(
      election.electionState == ElectionState.Voting,
      "Election not open for voting"
    );
    require(
      !election.voters[msg.sender],
      "address already voted for election term"
    );

    uint256 _usedVoiceCredits = 0;
    uint256 _stakedVoiceCredits = staking.getVoiceCredits(msg.sender);

    require(_stakedVoiceCredits > 0, "must have voice credits from staking");

    for (uint256 i = 0; i < _beneficiaries.length; i++) {
      // todo: consider skipping iteration instead of throwing since if a beneficiary is removed from the registry during an election, it can prevent votes from being counted
      require(
        _isEligibleBeneficiary(_beneficiaries[i], _electionId),
        "ineligible beneficiary"
      );

      _usedVoiceCredits = _usedVoiceCredits.add(_voiceCredits[i]);
      uint256 _sqredVoiceCredits = sqrt(_voiceCredits[i]);

      Vote memory _vote =
        Vote({
          voter: msg.sender,
          beneficiary: _beneficiaries[i],
          weight: _sqredVoiceCredits
        });

      election.votes.push(_vote);
      election.voters[msg.sender] = true;
    }
    require(
      _usedVoiceCredits <= _stakedVoiceCredits,
      "Insufficient voice credits"
    );
    emit UserVoted(msg.sender, election.electionTerm);
  }

  function fundIncentive(uint256 _amount) public {
    require(POP.balanceOf(msg.sender) >= _amount, "not enough pop");
    POP.safeTransferFrom(msg.sender, address(this), _amount);
    incentiveBudget = incentiveBudget.add(_amount);
  }

  /* ========== RESTRICTED FUNCTIONS ========== */

  //TODO needs some kind of whitelisting
  function proposeFinalization(uint256 _electionId, bytes32 _merkleRoot)
    external
  {
    Election storage _election = elections[_electionId];
    require(
      _election.electionState != ElectionState.Finalized,
      "election already finalized"
    );
    require(
      _election.electionState == ElectionState.Closed,
      "election not yet closed"
    );
    //TODO how to check for elegible awardees?
    require(_election.votes.length > 1, "no elegible awardees");

    _election.merkleRoot = _merkleRoot;
    _election.electionState = ElectionState.FinalizationProposed;

    uint256 finalizationIncentive =
      electionDefaults[uint8(_election.electionTerm)].finalizationIncentive;

    if (incentiveBudget >= finalizationIncentive) {
      POP.approve(address(this), finalizationIncentive);
      POP.safeTransferFrom(address(this), msg.sender, finalizationIncentive);
      incentiveBudget.sub(finalizationIncentive);
    }
    emit FinalizationProposed(_electionId, _merkleRoot);
  }

  //TODO needs some kind of whitelisting
  function approveFinalization(uint256 _electionId, bytes32 _merkleRoot)
    external
  {
    Election storage _election = elections[_electionId];
    require(
      _election.electionState != ElectionState.Finalized,
      "election already finalized"
    );
    require(
      _election.electionState == ElectionState.FinalizationProposed,
      "finalization not yet proposed"
    );
    require(_election.merkleRoot == _merkleRoot, "Incorrect root");

    //TODO how to calculate vault endtime?
    beneficiaryVaults.initializeVault(
      uint8(_election.electionTerm),
      0,
      _merkleRoot
    );
    _election.electionState = ElectionState.Finalized;

    emit ElectionFinalized(_electionId, _merkleRoot);
  }

  function toggleRegistrationBondRequirement(ElectionTerm _term)
    external
    onlyGovernance
  {
    electionDefaults[uint8(_term)].registrationBondRequired = !electionDefaults[
      uint8(_term)
    ]
      .registrationBondRequired;
  }

  function _collectRegistrationBond(Election storage _election) internal {
    if (_election.electionConfiguration.registrationBondRequired == true) {
      require(
        POP.balanceOf(msg.sender) >=
          _election.electionConfiguration.registrationBond,
        "insufficient registration bond balance"
      );

      POP.safeTransferFrom(
        msg.sender,
        address(this),
        _election.electionConfiguration.registrationBond
      );
    }
  }

  function _setDefaults() internal {
    ElectionConfiguration storage monthlyDefaults =
      electionDefaults[uint8(ElectionTerm.Monthly)];
    monthlyDefaults.awardees = 1;
    monthlyDefaults.ranking = 3;
    monthlyDefaults.useChainLinkVRF = true;
    monthlyDefaults.registrationBondRequired = true;
    monthlyDefaults.registrationBond = 50e18;
    monthlyDefaults.votingPeriod = 7 days;
    monthlyDefaults.registrationPeriod = 7 days;
    monthlyDefaults.cooldownPeriod = 21 days;
    monthlyDefaults.finalizationIncentive = 2000e18;

    ElectionConfiguration storage quarterlyDefaults =
      electionDefaults[uint8(ElectionTerm.Quarterly)];
    quarterlyDefaults.awardees = 2;
    quarterlyDefaults.ranking = 5;
    quarterlyDefaults.useChainLinkVRF = true;
    quarterlyDefaults.registrationBondRequired = true;
    quarterlyDefaults.registrationBond = 100e18;
    quarterlyDefaults.votingPeriod = 14 days;
    quarterlyDefaults.registrationPeriod = 14 days;
    quarterlyDefaults.cooldownPeriod = 83 days;
    quarterlyDefaults.finalizationIncentive = 2000e18;

    ElectionConfiguration storage yearlyDefaults =
      electionDefaults[uint8(ElectionTerm.Yearly)];
    yearlyDefaults.awardees = 3;
    yearlyDefaults.ranking = 7;
    yearlyDefaults.useChainLinkVRF = true;
    yearlyDefaults.registrationBondRequired = true;
    yearlyDefaults.registrationBond = 1000e18;
    yearlyDefaults.votingPeriod = 30 days;
    yearlyDefaults.registrationPeriod = 30 days;
    yearlyDefaults.cooldownPeriod = 358 days;
    yearlyDefaults.finalizationIncentive = 2000e18;
  }

  function sqrt(uint256 y) internal pure returns (uint256 z) {
    if (y > 3) {
      z = y;
      uint256 x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
    } else if (y != 0) {
      z = 1;
    }
  }

  /* ========== SETTER ========== */

  function setConfiguration(
    ElectionTerm _term,
    uint8 _awardees,
    uint8 _ranking,
    bool _useChainLinkVRF,
    bool _registrationBondRequired,
    uint256 _registrationBond,
    uint256 _votingPeriod,
    uint256 _registrationPeriod,
    uint256 _cooldownPeriod
  ) public onlyGovernance {
    ElectionConfiguration storage _defaults = electionDefaults[uint8(_term)];
    _defaults.awardees = _awardees;
    _defaults.ranking = _ranking;
    _defaults.useChainLinkVRF = _useChainLinkVRF;
    _defaults.registrationBondRequired = _registrationBondRequired;
    _defaults.registrationBond = _registrationBond;
    _defaults.votingPeriod = _votingPeriod;
    _defaults.registrationPeriod = _registrationPeriod;
    _defaults.cooldownPeriod = _cooldownPeriod;
  }

  /* ========== MODIFIERS ========== */

  modifier validAddress(address _address) {
    require(_address == address(_address), "invalid address");
    _;
  }
}
