// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0;

interface IRandomNumberConsumer {
  function getRandomNumber(uint256 electionId, uint256 seed) external;

  function getRandomResult(uint256 electionId) external view returns (uint256);
}
