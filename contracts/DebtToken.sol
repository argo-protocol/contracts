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
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20FlashMint } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20FlashMint.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ILayerZeroReceiver } from "./interfaces/LayerZero/ILayerZeroReceiver.sol";
import { ILayerZeroEndpoint } from "./interfaces/LayerZero/ILayerZeroEndpoint.sol";

/**
 * @notice A collateralized debt position token. Protocol assumes this is worth $1.
 */
contract DebtToken is ERC20, Ownable, IERC3156FlashLender, ILayerZeroReceiver {
    bytes32 private constant _RETURN_VALUE = keccak256("ERC3156FlashBorrower.onFlashLoan");
    uint private maxFlashLoanAmount;
    uint private flashFeeRate;
    uint public feesCollected;
    uint private constant FLASH_FEE_PRECISION = 1e5;
    address private treasury;

    ILayerZeroEndpoint public immutable lzEndpoint;
    mapping(uint16 => bytes) public lzRemotes;

    event FlashFeeRateUpdated(uint newFlashFeeRate);
    event MaxFlashLoanAmountUpdated(uint newMaxFlashLoanAmount);
    event TreasuryUpdated(address newTreasury);
    event FeesHarvested(uint fees);

    constructor(address _treasury, address _lzEndpoint) ERC20("Argo Stablecoin", "ARGO") {
        require(_treasury != address(0), "DebtToken: 0x0 treasury address");
        treasury = _treasury;
        maxFlashLoanAmount = 0;
        flashFeeRate = 0;
        lzEndpoint = ILayerZeroEndpoint(_lzEndpoint);

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

    /** LAYERZERO Implementation **/

    // send tokens to another chain.
    // this function sends the tokens from your address to the same address on the destination.
    function sendTokens(
        uint16 _chainId, // send tokens to this chainId
        bytes calldata _dstOmniChainTokenAddr, // destination address of OmniChainToken
        uint256 _qty // how many tokens to send
    ) public payable {
        // burn the tokens locally.
        // tokens will be minted on the destination.
        require(allowance(msg.sender, address(this)) >= _qty, "DebtToken: low allowance");

        // and burn the local tokens *poof*
        _burn(msg.sender, _qty);

        // abi.encode() the payload with the values to send
        bytes memory payload = abi.encode(msg.sender, _qty);

        // send LayerZero message
        lzEndpoint.send{ value: msg.value }(
            _chainId, // destination chainId
            _dstOmniChainTokenAddr, // destination address of OmniChainToken
            payload, // abi.encode()'ed bytes
            payable(msg.sender), // refund address (LayerZero will refund any superflous gas back to caller of send()
            address(0x0), // 'zroPaymentAddress' unused for this mock/example
            bytes("") // 'txParameters' unused for this mock/example
        );
    }

    // _chainId - the chainId for the remote contract
    // _remoteAddress - the contract address on the remote chainId
    // the owner must set remote contract addresses.
    // in lzReceive(), a require() ensures only messages
    // from known contracts can be received.
    function setLZRemote(uint16 _chainId, bytes calldata _remoteAddress) external onlyOwner {
        require(lzRemotes[_chainId].length == 0, "DebtToken: setLZRemote already set");
        lzRemotes[_chainId] = _remoteAddress;
    }

    // receive the bytes payload from the source chain via LayerZero
    // _fromAddress is the source OmniChainToken address
    function lzReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64,
        bytes memory _payload
    ) external override {
        // lzReceive must be called by the lzEndpoint for security
        require(msg.sender == address(lzEndpoint), "DebtToken: lzReceive bad sender");

        //Owner should call setRemote() to enable remote contract
        require(
            _srcAddress.length == lzRemotes[_srcChainId].length &&
                keccak256(_srcAddress) == keccak256(lzRemotes[_srcChainId]),
            "DebtToken: lzReceive bad remote"
        );

        // decode
        (address toAddr, uint256 qty) = abi.decode(_payload, (address, uint256));
        // mint the tokens back into existence, to the toAddr from the message payload
        _mint(toAddr, qty);
    }
}
