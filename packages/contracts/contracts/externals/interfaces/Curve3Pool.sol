// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

interface Curve3Pool {
  function get_virtual_price() external view returns (uint256);

  function add_liquidity(uint256[3] calldata amounts, uint256 min_mint_amounts)
    external;

  function remove_liquidity_one_coin(
    uint256 burn_amount,
    int128 i,
    uint256 min_amount
  ) external;

  function calc_withdraw_one_coin(uint256 _token_amount, int128 i)
    external
    view
    returns (uint256);

  function coins(uint256 i) external view returns (address);
}
