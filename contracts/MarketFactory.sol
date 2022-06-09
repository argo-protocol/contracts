//SPDX-License-Identifier: MIT
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

import { IMarket } from "./interfaces/IMarket.sol";
import { ZeroInterestMarket } from "./ZeroInterestMarket.sol";
import { PegStability } from "./PegStability.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * Factory for Markets
 **/
contract MarketFactory {
    /**
     * @notice New market created
     * @param market Address of the new market
     */
    event CreateMarket(address indexed debtToken, address indexed collateralToken, address market);

    /**
     * @notice New PSM created
     * @param psm Address of the new PSM
     */
    event CreatePSM(address indexed debtToken, address indexed reserveToken, address psm);

    ZeroInterestMarket private zeroInterestMarketImpl;
    PegStability private pegStabilityImpl;

    /**
     * @notice Create new MarketFactory
     */
    constructor() {
        zeroInterestMarketImpl = new ZeroInterestMarket();
        zeroInterestMarketImpl.initialize(
            address(0x0),
            address(0x0),
            address(0x0),
            address(0x0),
            address(0x0),
            0,
            0,
            0
        );

        pegStabilityImpl = new PegStability();
        pegStabilityImpl.initialize(address(0x0), address(0x0), address(0x0), 0, 0, address(0x0));
    }

    /**
     * @notice Create new ZeroInterestMarket owned by this contract's owner
     * @param _owner the account that administers the market
     * @param _treasury the account that receives fees
     * @param _collateralToken ERC-20 to be deposited as collateral
     * @param _debtToken ERC-20 to be withdrawn as debt
     * @param _oracle Oracle from which to fetch updated collateral/debt token price
     * @param _maxLoanToValue Maximum ratio of debt to collateral
     * @param _borrowRate Rate to calculate flat borrow fee
     * @param _liquidationPenalty Rate to calculate liquidation penalty
     */
    function createZeroInterestMarket(
        address _owner,
        address _treasury,
        address _collateralToken,
        address _debtToken,
        address _oracle,
        uint256 _maxLoanToValue,
        uint256 _borrowRate,
        uint256 _liquidationPenalty
    ) public {
        require(_treasury != address(0), "0x0 treasury address");
        require(_collateralToken != address(0), "0x0 collateralToken address");
        require(_debtToken != address(0), "0x0 debtToken address");
        require(_oracle != address(0), "0x0 debtToken address");

        ZeroInterestMarket market = ZeroInterestMarket(Clones.clone(address(zeroInterestMarketImpl)));
        market.initialize(
            _owner,
            _treasury,
            _collateralToken,
            _debtToken,
            _oracle,
            _maxLoanToValue,
            _borrowRate,
            _liquidationPenalty
        );
        emit CreateMarket(_debtToken, _collateralToken, address(market));
    }

    /**
     * @notice Create new Peg Stability Module (PSM) owned by this contract's owner
     * @param _owner the account that administers the PSM
     * @param _debtToken ERC-20 to be withdrawn as debt
     * @param _reserveToken ERC-20 to be deposited as collateral
     * @param _buyFee Fee for buying debtToken
     * @param _sellFee Fee for selling debtToken
     * @param _treasury the account that receives fees
     */
    function createPegStabilityModule(
        address _owner,
        address _debtToken,
        address _reserveToken,
        uint256 _buyFee,
        uint256 _sellFee,
        address _treasury
    ) public {
        require(_debtToken != address(0), "0x0 debt token");
        require(_reserveToken != address(0), "0x0 reserve token");
        require(_treasury != address(0), "0x0 treasury");

        PegStability psm = PegStability(Clones.clone(address(pegStabilityImpl)));
        psm.initialize(_owner, _debtToken, _reserveToken, _buyFee, _sellFee, _treasury);

        emit CreatePSM(_debtToken, _reserveToken, address(psm));
    }
}
