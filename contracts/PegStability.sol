// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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

import { IPSM } from "./interfaces/IPSM.sol";
import { DecimalConverter } from "./libraries/DecimalConverter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @notice A Peg Stability Module (PSM) that allows swapping debtToken 1:1 for another
 * stablecoin assesses a buy and sell fee on swaps. While fees are collected in both the
 * reserve and debt tokens, they are only harvested in debt tokens.
 */
contract PegStability is Ownable, IPSM, Initializable {
    using SafeERC20 for IERC20Metadata;
    using DecimalConverter for uint256;

    event FeesHarvested(uint reserveTokenHarvest, uint debtTokenHarvest);
    event ReservesBought(uint amount);
    event ReservesSold(uint amount);
    event ReservesWithdrawn(uint amount);
    event DebtTokensWithdrawn(uint amount);
    event BuyFeeUpdated(uint fee);
    event SellFeeUpdated(uint fee);

    IERC20Metadata public debtToken;
    IERC20Metadata public reserveToken;
    uint256 public override buyFee;
    uint256 public override sellFee;
    uint256 public constant override FEE_PRECISION = 1e5;

    uint256 public buyFeesCollected; // in reserve tokens
    uint256 public sellFeesCollected; // in debt tokens
    address public treasury;

    function initialize(
        address _owner,
        address _debtToken,
        address _reserveToken,
        uint256 _buyFee,
        uint256 _sellFee,
        address _treasury
    ) public initializer {
        debtToken = IERC20Metadata(_debtToken);
        reserveToken = IERC20Metadata(_reserveToken);

        buyFee = _buyFee;
        sellFee = _sellFee;
        treasury = _treasury;

        Ownable._transferOwnership(_owner);
    }

    /**
     * @notice buys _amount of reserveToken for debtToken.
     * Will transfer _amount + buy fees of reserveToken from msg.sender
     * requires approval
     * @param _amount the amount of reserve token to buy
     */
    function buy(uint256 _amount) external override {
        uint256 debtTokenAmount = _amount.convertDecimal(reserveToken.decimals(), debtToken.decimals());

        // ensure we can still withdraw fees
        require(debtTokenAmount + sellFeesCollected <= debtToken.balanceOf(address(this)), "insufficient balance");

        uint256 fees = (_amount * buyFee) / FEE_PRECISION;
        buyFeesCollected += fees;

        emit ReservesBought(_amount);

        reserveToken.safeTransferFrom(msg.sender, address(this), _amount + fees);
        debtToken.safeTransfer(msg.sender, debtTokenAmount);
    }

    /**
     * @notice PSM sells _amount of reserveToken in exchange for debtToken.
     * Will transfer _amount + sell fees of debtToken from msg.sender
     * requires approval
     * @param _amount the amount of reserve token to sell
     */
    function sell(uint256 _amount) external override {
        uint256 debtTokenAmount = _amount.convertDecimal(reserveToken.decimals(), debtToken.decimals());

        require(_amount + buyFeesCollected <= reserveToken.balanceOf(address(this)), "insufficient balance");

        uint256 fees = (debtTokenAmount * sellFee) / FEE_PRECISION;
        sellFeesCollected += fees;

        emit ReservesSold(_amount);

        debtToken.safeTransferFrom(msg.sender, address(this), debtTokenAmount + fees);
        reserveToken.safeTransfer(msg.sender, _amount);
    }

    /**
     * @notice withdraw a portion of the reserves to the owner
     * @param _amount the amount of reserves to withdraw
     */
    function withdrawReserves(uint256 _amount) external onlyOwner {
        require(_amount > 0, "zero withdraw");

        emit ReservesWithdrawn(_amount);
        reserveToken.safeTransfer(this.owner(), _amount);
    }

    /**
     * @notice withdraw a portion of the debt tokens to the owner
     * @param _amount the amount of debt tokens to withdraw
     */
    function withdrawDebtTokens(uint256 _amount) external onlyOwner {
        require(_amount > 0, "zero withdraw");

        emit DebtTokensWithdrawn(_amount);
        debtToken.safeTransfer(this.owner(), _amount);
    }

    /**
     * @notice update the buy fee
     * @param _buyFee the new buy fee
     */
    function setBuyFee(uint256 _buyFee) external onlyOwner {
        require(_buyFee < FEE_PRECISION, "fee too high");
        buyFee = _buyFee;
        emit BuyFeeUpdated(_buyFee);
    }

    /**
     * @notice updates the sell fee
     * @param _sellFee the new sell fee
     */
    function setSellFee(uint256 _sellFee) external onlyOwner {
        require(_sellFee < FEE_PRECISION, "fee too high");
        sellFee = _sellFee;
        emit SellFeeUpdated(_sellFee);
    }

    /**
     * @notice Harvests fees collected to the treasury
     */
    function harvestFees() external {
        uint debtTokenHarvest = sellFeesCollected;
        uint reserveTokenHarvest = buyFeesCollected;
        sellFeesCollected = 0;
        buyFeesCollected = 0;
        emit FeesHarvested(reserveTokenHarvest, debtTokenHarvest);

        debtToken.safeTransfer(treasury, debtTokenHarvest);
        reserveToken.safeTransfer(treasury, reserveTokenHarvest);
    }

    /**
     * @notice recover tokens inadvertantly sent to this contract by transfering them to the owner
     * @param _token the address of the token
     * @param _amount the amount to transfer
     */
    function recoverERC20(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(debtToken), "Cannot recover debt tokens");
        require(_token != address(reserveToken), "Cannot recover reserve tokens");

        IERC20Metadata(_token).safeTransfer(msg.sender, _amount);
    }
}
