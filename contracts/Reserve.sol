// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

//
//        ___           ___           ___           ___
//       /\  \         /\  \         /\__\         /\  \
//      /::\  \       /::\  \       /:/ _/_       /::\  \
//     /:/\:\  \     /:/\:\__\     /:/ /\  \     /:/\:\  \
//    /:/ /::\  \   /:/ /:/  /    /:/ /::\  \   /:/  \:\  \
//   /:/_/:/\:\__\ /:/_/:/__/___ /:/__\/\:\__\ /:/__/ \:\__\
//   \:\/:/  \/__/ \:\/:::::/  / \:\  \ /:/  / \:\  \ /:/  /
//    \::/__/       \::/~~/~~~~   \:\  /:/  /   \:\  /:/  /
//     \:\  \        \:\~~\        \:\/:/  /     \:\/:/  /
//      \:\__\        \:\__\        \::/  /       \::/  /
//       \/__/         \/__/         \/__/         \/__/
//

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOracle } from "./interfaces/IOracle.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


/**
 * @notice Sketch for storing the reserves the back ARGO
 * Owner / Governance can:
 * - approve/deny assets
 * - approve/deny market operators
 *
 * Assets are ERC-20s that back the value of ARGO
 * - All assets have an oracle that determine their value
 * - Stablecoin assets use a special "par" oracle pegged to $1
 * - An asset can be "audited" to update its last price and what it contributes to reserves
 * - all assets can be audited by anyone at anytime
 *
 * Market operators are smart contracts that can:
 * - borrow/return reserves - for deploying into curve or aave
 * - give/take reserves - for PSM-like swapping
 * - mint/burn ARGO - up to the reserve limit
 */
contract Reserve is Ownable {
    using SafeERC20 for IERC20Metadata;

    struct Asset {
        IERC20Metadata token;
        IOracle oracle;
        uint256 lastPrice;
        uint256 lent;
        uint256 reserveRatio; // ?? - keep some undeployed for PSM
    }
    Asset[] public assets;
    mapping(IERC20Metadata => uint256) public tokensToAssetIndex;
    uint256 public backing;
    uint256 public argoOutstanding;

    /**
     * @notice can be called by anyone to verify the backing
     */
    function auditBacking() public {
        uint256 len = assets.length;
        uint256 newBacking;

        for (uint256 i = 0; i < len; i++) {
            Asset memory asset = assets[i];
            uint256 balance = asset.token.balanceOf(address(this)) + asset.lent;
            (bool success, uint256 price) = asset.oracle.fetchPrice();
            if (success) {
                asset.lastPrice = price;
                assets[i].lastPrice = price; // save last price
            }
            newBacking += (asset.lastPrice * balance) / (10**asset.token.decimals());
        }
        backing = newBacking;
    } 

    function approveAsset(IERC20Metadata _token, IOracle _oracle) public onlyOwner {
        require(address(_token) != address(0), "0x0 token");
        require(address(_oracle) != address(0), "0x0 oracle");
        require(tokensToAssetIndex[_token] == 0, "asset exists");

        (bool success, uint256 price) = _oracle.fetchPrice();
        require(success, "Oracle Failed");
        
        uint id = assets.length;
        Asset memory asset = Asset(
            _token,
            _oracle,
            price,
            0,
            0
        );
        assets.push(asset);
        tokensToAssetIndex[_token] = id;
    } 

    function revokeAsset(IERC20Metadata _token) public onlyOwner {
        require(tokensToAssetIndex[_token] != 0, "unknown asset");

        // what if the asset is lent out? Maybe a "force" flag

        uint256 id = tokensToAssetIndex[_token];
        assets[id] = Asset(IERC20Metadata(address(0)), IOracle(address(0)), 0, 0, 0);
        delete tokensToAssetIndex[_token];
    }

    function receiveAsset(uint256 _assetId, uint256 _amount) public onlyOwner {
        Asset memory asset = assets[_assetId];
        require(address(asset.token) != address(0), "Unknown Asset");
        uint256 prevAssetAmount = asset.token.balanceOf(address(this)) + asset.lent;
        uint256 assetPrecision = 10**asset.token.decimals();
        uint256 prevAssetBacking = (prevAssetAmount * asset.lastPrice) / assetPrecision;

        (bool success, uint256 price) = asset.oracle.fetchPrice();
        if (success) {
            asset.lastPrice = price;
            assets[_assetId].lastPrice = price; // save last price
        }
        uint256 newAssetBacking = (asset.lastPrice * (prevAssetAmount + _amount)) / assetPrecision;
        backing = backing - prevAssetBacking + newAssetBacking;

        asset.token.safeTransferFrom(msg.sender, address(this), _amount);
    }

    function takeAsset(uint256 _assetId, uint256 _amount, address _to) public onlyOwner {
        Asset memory asset = assets[_assetId];
        require(address(asset.token) != address(0), "Unknown Asset");
        uint256 balance = asset.token.balanceOf(address(this));
        require(_amount <= balance, "insufficient balance");
        uint256 prevAssetAmount = balance + asset.lent;
        uint256 assetPrecision = 10**asset.token.decimals();
        uint256 prevAssetBacking = (prevAssetAmount * asset.lastPrice) / assetPrecision;

        (bool success, uint256 price) = asset.oracle.fetchPrice();
        if (success) {
            asset.lastPrice = price;
            assets[_assetId].lastPrice = price; // save last price
        }
        uint256 newAssetBacking = (asset.lastPrice * (prevAssetAmount - _amount)) / assetPrecision;
        backing = backing - prevAssetBacking + newAssetBacking;

        asset.token.safeTransfer(_to, _amount);
    }

    // this should be only whitelisted borrowers
    function borrowAsset(uint256 _assetId, uint256 _amount) public onlyOwner {

    }

    // this should be only whitelisted borrowers
    function returnAsset(uint256 _assetId, uint256 _amount) public onlyOwner {

    }

    // only whitelisted minter
    function mintArgo(uint256 _amount) public onlyOwner {
        // require outstanding argo + amount < backing

    }
    
    // only whitelisted minter
    function burnArgo(uint256 _amount) public onlyOwner {

    }
}