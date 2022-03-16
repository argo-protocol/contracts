//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ILiquidityMigrator } from "../interfaces/ILiquidityMigrator.sol";

contract LiquidityBootstrapVNext {
    ILiquidityMigrator public oldVersion;

    uint256 public totalShares;
    mapping(address => uint256) public userShares;

    constructor(address _oldVersion) {
        oldVersion = ILiquidityMigrator(_oldVersion);
    }

    function migrate() external {
        uint256 shares = oldVersion.migrate(msg.sender);
        totalShares += shares;
        userShares[msg.sender] += shares;
    }
}