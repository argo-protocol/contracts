// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ERC20Mock } from "./ERC20Mock.sol";
import { IERC4626 } from "../interfaces/IERC4626.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// mock class using ERC20
contract ERC4626Mock is ERC20Mock, IERC4626 {
    using SafeERC20 for IERC20;

    IERC20 public asset;

    constructor(
        string memory name,
        string memory symbol,
        address _asset
    ) ERC20Mock(name, symbol, address(1), 0) { 
        asset = IERC20(_asset);
    }

    function deposit(uint256 assets, address receiver) external override returns (uint256 shares) {
        // Check for rounding error since we round down in previewDeposit.
        require((shares = previewDeposit(assets)) != 0, "ZERO_SHARES");

        // Need to transfer before minting or ERC777s could reenter.
        asset.safeTransferFrom(msg.sender, address(this), assets);

        _mint(receiver, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external override returns (uint256 shares)  {
        shares = previewWithdraw(assets); // No need to check for rounding error, previewWithdraw rounds up.

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);

            if (allowed != type(uint256).max) {
                decreaseAllowance(owner, shares);
            }
        }

        _burn(owner, shares);

        asset.safeTransfer(receiver, assets);
    }

    /*///////////////////////////////////////////////////////////////
                ACCOUNTING LOGIC
    //////////////////////////////////////////////////////////////*/

    function totalAssets() public view virtual returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets * supply / totalAssets();
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares * totalAssets() / supply;
    }

    function previewDeposit(uint256 assets) public view virtual returns (uint256) {
        return convertToShares(assets);
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        if (supply == 0) {
            return assets;
        }

        uint256 z = assets * supply;
        if (z == 0) {
            return 0;
        }
        return ((z - 1) / totalAssets()) + 1;
    }

    function previewRedeem(uint256 shares) public override view returns (uint256) {
        return convertToAssets(shares);
    }
}