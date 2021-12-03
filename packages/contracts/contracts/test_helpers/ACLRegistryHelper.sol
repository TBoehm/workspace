// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

import "../core/interfaces/IACLRegistry.sol";

contract ACLRegistryHelper {
  IACLRegistry public aclRegistry;

  constructor(IACLRegistry _aclRegistry) {
    aclRegistry = _aclRegistry;
  }

  function senderProtected(bytes32 role) public {
    require(
      aclRegistry.hasRole(role, msg.sender),
      "you dont have the required role"
    );
  }
}
