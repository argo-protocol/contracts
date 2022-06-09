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

import { IERC3156FlashBorrower, IERC3156FlashLender } from "@openzeppelin/contracts/interfaces/IERC3156.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @notice A collateralized debt position token. Protocol assumes this is worth $1.
 */
contract DebtToken is ERC20Upgradeable, OwnableUpgradeable, IERC3156FlashLender {
    bytes32 private constant _RETURN_VALUE = keccak256("ERC3156FlashBorrower.onFlashLoan");
    uint private maxFlashLoanAmount;
    uint private flashFeeRate;
    uint public feesCollected;
    uint private constant FLASH_FEE_PRECISION = 1e5;
    address public treasury;

    event FlashFeeRateUpdated(uint newFlashFeeRate);
    event MaxFlashLoanAmountUpdated(uint newMaxFlashLoanAmount);
    event TreasuryUpdated(address newTreasury);
    event FeesHarvested(uint fees);

    function initialize(
        address _owner,
        address _treasury,
        string memory _name,
        string memory _symbol
    ) public initializer {
        __ERC20_init(_name, _symbol);
        _transferOwnership(_owner);
        treasury = _treasury;
        maxFlashLoanAmount = 0;
        flashFeeRate = 0;

        emit TreasuryUpdated(treasury);
        emit MaxFlashLoanAmountUpdated(maxFlashLoanAmount);
        emit FlashFeeRateUpdated(flashFeeRate);
    }

    /**
     * @notice mints new tokens to the _to address
     * @param _to address to receive the tokens
     * @param _amount number of tokens to recieve
     */
    function mint(address _to, uint _amount) external onlyOwner {
        _mint(_to, _amount);
    }

    /**
     * @notice burns _amount of msg.sender's tokens
     * @param _amount number of tokens to burn
     */
    function burn(uint _amount) external {
        _burn(msg.sender, _amount);
    }

    ///////////
    ///// EIP-3156 flash loan implementation
    ///////////

    /**
     * @dev Returns the maximum amount of tokens available for loan.
     * @param _token The address of the token that is requested.
     * @return The amont of token that can be loaned.
     */
    function maxFlashLoan(address _token) public view override returns (uint) {
        return _token == address(this) ? maxFlashLoanAmount : 0;
    }

    /**
     * @dev Returns the fee applied when doing flash loans.
     * @param _token The token to be flash loaned.
     * @param _amount The amount of tokens to be loaned.
     * @return The fees applied to the corresponding flash loan.
     */
    function flashFee(address _token, uint256 _amount) public view override returns (uint256) {
        require(_token == address(this), "ERC20FlashMint: wrong token");
        return (_amount * flashFeeRate) / FLASH_FEE_PRECISION;
    }

    /**
     * @dev Performs a flash loan. New tokens are minted and sent to the
     * `receiver`, who is required to implement the {IERC3156FlashBorrower}
     * interface. By the end of the flash loan, the receiver is expected to own
     * amount + fee tokens and have them approved back to the token contract itself so
     * they can be burned.
     * @param receiver The receiver of the flash loan. Should implement the
     * {IERC3156FlashBorrower.onFlashLoan} interface.
     * @param token The token to be flash loaned. Only `address(this)` is
     * supported.
     * @param amount The amount of tokens to be loaned.
     * @param data An arbitrary datafield that is passed to the receiver.
     * @return `true` is the flash loan was successful.
     */
    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) public override returns (bool) {
        require(amount <= maxFlashLoanAmount, "DebtToken: amount above max");
        uint256 fee = flashFee(token, amount);
        _mint(address(receiver), amount);
        require(
            receiver.onFlashLoan(msg.sender, token, amount, fee, data) == _RETURN_VALUE,
            "DebtToken: invalid return value"
        );
        uint256 currentAllowance = allowance(address(receiver), address(this));
        require(currentAllowance >= amount + fee, "allowance does not allow refund");
        _approve(address(receiver), address(this), currentAllowance - amount - fee);
        // save gas by burning the fee collected, will mint it again when harvesting
        _burn(address(receiver), amount + fee);
        feesCollected = feesCollected + fee;
        return true;
    }

    /**
     * @notice sets the flash fee rate with precision of 1e5, eg 100 == 0.1%
     * @param _flashFeeRate the new rate
     */
    function setFlashFeeRate(uint _flashFeeRate) external onlyOwner {
        require(_flashFeeRate < FLASH_FEE_PRECISION, "DebtToken: rate too high");
        flashFeeRate = _flashFeeRate;
        emit FlashFeeRateUpdated(flashFeeRate);
    }

    /**
     * @notice sets the flash loan cap
     * @param _maxFlashLoanAmount the new amount
     */
    function setMaxFlashLoanAmount(uint _maxFlashLoanAmount) external onlyOwner {
        maxFlashLoanAmount = _maxFlashLoanAmount;
        emit MaxFlashLoanAmountUpdated(maxFlashLoanAmount);
    }

    /**
     * @notice updates the treasury (where fees are sent)
     * @param _treasury the new treasury
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "DebtToken: 0x0 treasury address");
        treasury = _treasury;
        emit TreasuryUpdated(treasury);
    }

    /**
     * @notice harvests fees from flash loans to the treasury
     */
    function harvestFees() external {
        uint fees = feesCollected;
        feesCollected = 0;
        emit FeesHarvested(fees);

        // we burned the fee when we collected it
        _mint(treasury, fees);
    }
}
