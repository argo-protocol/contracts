//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

// solhint-disable func-name-mixedcase, var-name-mixedcase

interface ICurveStableSwapPool is IERC20Metadata {
    function add_liquidity(uint256[2] memory _amounts, uint256 _min_mint_amount) external returns (uint256);
    function remove_liquidity(uint256 _amount, uint256[2] memory _min_amounts) external returns (uint256[2] memory);
    function calc_token_amount(uint256[2] memory _amounts, bool _is_deposit) external view returns (uint256);
    function balances(uint256 _i) external view returns(uint256);
}

interface ICurveFactory {
    function find_pool_for_coins(address _from, address _to) external view returns(address);
    function deploy_metapool(address _base_pool, string memory _name, string memory _symbol, address _coin, uint256 _A, uint256 _fee) external returns (address);
}
