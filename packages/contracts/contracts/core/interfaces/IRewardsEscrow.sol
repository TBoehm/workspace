// SPDX-License-Identifier: MIT

// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

interface IRewardsEscrow {
  function lock(address _address, uint256 _amount) external;
}
