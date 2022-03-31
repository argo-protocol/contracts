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

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ILayerZeroReceiver } from "./interfaces/LayerZero/ILayerZeroReceiver.sol";
import { ILayerZeroEndpoint } from "./interfaces/LayerZero/ILayerZeroEndpoint.sol";
import { IDebtToken } from "./interfaces/IDebtToken.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice A collateralized debt position token. Protocol assumes this is worth $1.
 */
contract LayerZeroController is ILayerZeroReceiver, Ownable {
    using SafeERC20 for IERC20;

    mapping(uint16 => bytes) public remotes;
    ILayerZeroEndpoint public endpoint;
    IDebtToken public token;

    constructor(IDebtToken _token) {
        token = _token;
    }

    /**
     * @notice Send tokens to another chain.
     * @param _chainId Remote chain where the tokens are going
     * @param _dstOmniChainTokenAddr Address of token on remote chain
     * @param _qty Quantity of tokens to send
     */
    function sendTokens(
        uint16 _chainId,
        bytes calldata _dstOmniChainTokenAddr,
        uint256 _qty
    ) public payable requireLayerZeroEnabled {
        require(token.allowance(msg.sender, address(this)) >= _qty, "LZC: low allowance");
        require(token.transferFrom(msg.sender, address(this), _qty), "LZC: transfer fail");
        token.burn(_qty);
        bytes memory payload = abi.encode(msg.sender, _qty);

        /* solhint-disable check-send-result */
        endpoint.send{ value: msg.value }(
            _chainId,
            _dstOmniChainTokenAddr,
            payload,
            payable(msg.sender),
            address(0x0),
            bytes("")
        );
    }

    /**
     * @notice LayerZero endpoint will invoke this function to deliver the message on the destination
     * @param _srcChainId - the source endpoint identifier
     * @param _srcAddress - the source sending contract address from the source chain
     * @param - the ordered message nonce
     * @param _payload - the signed payload is the UA bytes has encoded to be sent
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64,
        bytes memory _payload
    ) external override requireLayerZeroEnabled {
        require(msg.sender == address(endpoint), "LZC: lzReceive bad sender");
        require(
            _srcAddress.length == remotes[_srcChainId].length &&
                keccak256(_srcAddress) == keccak256(remotes[_srcChainId]),
            "LZC: lzReceive bad remote"
        );
        (address toAddr, uint256 qty) = abi.decode(_payload, (address, uint256));
        token.mint(toAddr, qty);
    }

    /**
     * @notice The owner must set remote contract addresses
     * @param _chainId The chainId for the remote contract
     * @param _remoteAddress The contract address on the remote chainId
     */
    function setLayerZeroRemote(uint16 _chainId, bytes calldata _remoteAddress) external onlyOwner {
        remotes[_chainId] = _remoteAddress;
    }

    /**
     * @notice The owner must set remote contract addresses
     * @dev Only settable by the owner. Disable LayerZero by setting to 0x0.
     * @param _endpoint The address of the ILayerZeroEndpoint contract
     */
    function setLayerZeroEndpoint(address _endpoint) public onlyOwner {
        endpoint = ILayerZeroEndpoint(_endpoint);
    }

    /**
     * @notice Only allow when endpoint is set
     */
    modifier requireLayerZeroEnabled() {
        require(address(endpoint) != address(0), "LZC: disabled");
        _;
    }

    /**
     * @notice recover tokens inadvertantly sent to this contract by transfering them to the owner
     * @param _token the address of the token
     * @param _amount the amount to transfer
     */
    function recoverERC20(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(token), "LZC: Cannot recover LZC token");

        IERC20(_token).safeTransfer(msg.sender, _amount);
    }
}
