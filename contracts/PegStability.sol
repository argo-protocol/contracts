// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IPSM } from "./interfaces/IPSM.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice A Peg Stability Module (PSM) that allows swapping debtToken 1:1 for another 
 * stablecoin assesses a buy and sell fee on swaps. While fees are collected in both the
 * reserve and debt tokens, they are only harvested in debt tokens.
 */
contract PegStability is Ownable, IPSM {
    using SafeERC20 for IERC20Metadata;

    event FeesHarvested(uint fees);
    event ReservesBought(uint amount);
    event ReservesSold(uint amount);
    event ReservesWithdrawn(uint amount);
    event DebtTokensWithdrawn(uint amount);
    event BuyFeeUpdated(uint fee);
    event SellFeeUpdated(uint fee);

    IERC20Metadata immutable public debtToken;
    IERC20Metadata immutable public reserveToken;
    uint256 public override buyFee;
    uint256 public override sellFee;
    uint256 constant public override FEE_PRECISION = 1e5;

    uint256 public feesCollected;
    address public treasury;

    constructor(
        address _debtToken,
        address _reserveToken,
        uint256 _buyFee,
        uint256 _sellFee,
        address _treasury
    ) {
        require(_debtToken != address(0), "0x0 debt token");
        require(_reserveToken != address(0), "0x0 reserve token");
        require(_treasury != address(0), "0x0 treasury");
        require(IERC20Metadata(_debtToken).decimals() == IERC20Metadata(_reserveToken).decimals(), "decimal mismatch");

        debtToken = IERC20Metadata(_debtToken);
        reserveToken = IERC20Metadata(_reserveToken);

        buyFee = _buyFee;
        sellFee = _sellFee;
        treasury = _treasury;
    }

    /**
     * @notice sells _amount of debt token for reserveToken.
     * Will transfer _amount + buy fees of reserveToken from msg.sender
     * requires approval
     * @param _amount the amount of debt token to buy
     */
    function buy(uint256 _amount) external override {
        // ensure we can still withdraw fees
        require(_amount + feesCollected <= debtToken.balanceOf(address(this)), "insufficient balance");

        uint256 fees = (_amount * buyFee) / FEE_PRECISION;
        feesCollected = feesCollected + fees;

        emit ReservesBought(_amount);

        reserveToken.safeTransferFrom(msg.sender, address(this), _amount + fees);
        debtToken.safeTransfer(msg.sender, _amount);
    }

    /**
     * @notice sells _amount of reserve token in exchange for debt token.
     * Will transfer _amount + sell fees of debtToken from msg.sender
     * requires approval
     * @param _amount the amount of debt token to sell
     */
    function sell(uint256 _amount) external override {
        uint256 fees = (_amount * sellFee) / FEE_PRECISION;
        feesCollected = feesCollected + fees;

        emit ReservesSold(_amount);

        debtToken.safeTransferFrom(msg.sender, address(this), _amount + fees);
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
        buyFee = _buyFee;
        emit BuyFeeUpdated(_buyFee);
    }

    /**
     * @notice updates the sell fee
     * @param _sellFee the new sell fee
     */
    function setSellFee(uint256 _sellFee) external onlyOwner {
        sellFee = _sellFee;
        emit SellFeeUpdated(_sellFee);
    }

    /**
     * @notice Harvests fees collected to the treasury
     */
    function harvestFees() external {
        uint fees = feesCollected;
        feesCollected = 0;
        emit FeesHarvested(fees);

        debtToken.safeTransfer(treasury, fees);
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