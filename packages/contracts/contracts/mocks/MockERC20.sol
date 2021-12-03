// SPDX-License-Identifier: MIT

// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

import "../externals/ERC20.sol";

contract MockERC20 is ERC20 {
  constructor(
    string memory name_,
    string memory symbol_,
    uint8 decimals_
  ) ERC20(name_, symbol_) {
    _setupDecimals(decimals_);
  }

  function mint(address to_, uint256 amount_) public {
    _mint(to_, amount_);
  }

  function burn(address from_, uint256 amount_) public {
    _burn(from_, amount_);
  }
}
