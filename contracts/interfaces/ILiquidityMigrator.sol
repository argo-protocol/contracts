//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


interface ILiquidityMigrator {
    /**
     * @notice migrates the user's LP tokens
     * @param _user user to migrate
     * @return the number of LP shares migrated
     */
    function migrate(address _user) external returns (uint256);
}