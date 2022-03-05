// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "./interfaces/IOracle.sol";
import { IMarket } from "./interfaces/IMarket.sol";
import { IDebtToken } from "./interfaces/IDebtToken.sol";
import { IgOHM } from "./interfaces/IgOHM.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "hardhat/console.sol";

/**
 * A lending market that supports borrowing ARGOHM against OHM with a 100% LTV
 * Assumes the price of OHM == ARGOHM, so there are no liquidations and no oracle
 * Fees are assessed at borrow time and on every rebase
 */
contract StakedOhmMarket is Ownable {
    using SafeERC20 for IgOHM;
    using SafeERC20 for IERC20;

    event Deposit(address indexed from, address indexed to, uint256 amount);
    event Withdraw(address indexed from, address indexed to, uint256 amount);
    event Borrow(address indexed from, address indexed to, uint256 amount);
    event Repay(address indexed from, address indexed to, uint256 amount);
    event TreasuryUpdated(address newTreasury);
    event FeesHarvested(uint fees);

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    /// Idle gOHM is deposited by a user, but has not been borrowed against.
    /// it can be freely withdrawn and does not have fees taken out of its rebases
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    /// @dev user account to gOHM amount
    mapping(address => uint) public userIdle; // in gOHM
    /// @dev gOHM amount
    uint public totalIdle; // in gOHM

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    /// Once gOHM is borrowed against, it becomes "collateral" and its rebases
    /// are subject to fees. As fees are extracted, the totalCollateral amount of gOHM
    /// will decrease (but the underlying OHM increases).
    /// A user's portion of the collateral is tracked using shares. A user claims ownership
    /// of userShare / totalShare of totalCollateral. This allows fee extraction to be gas
    /// efficient.
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /// @dev user account -> collateral shares
    mapping(address => uint) public userCollateralShares; // 18 decimals
    /// @dev sum of all the collateral shares
    uint public totalCollateralShares; // 18 decimals
    /// total gOHM borrowed against, this is reduced as fees
    /// are assessed against rebases
    uint public totalCollateral; // in gOHM

    /// account -> ARGOHM borrowed
    mapping(address => uint) public userDebts; // 9 decimals
    /// total amount of ARGOHM outstanding
    uint public totalDebt; // 9 decimals

    uint public lastAssessedIndex; // 9 decimals
    uint public feesAvailable; // in gOHM

    IgOHM immutable public gohm;
    IERC20 immutable public argohm;
    address public treasury;
    uint public immutable borrowRate; // 5000 = 5%
    uint public immutable rebaseRate; // 5000 = 5%
    uint public constant FEE_RATE_DECIMALS = 5;

    constructor(address _gohm, address _argohm, address _treasury, uint _borrowRate, uint _rebaseRate) {
        gohm = IgOHM(_gohm);
        argohm = IERC20(_argohm);
        treasury = _treasury;
        borrowRate = _borrowRate;
        rebaseRate = _rebaseRate;
    }
    
    function deposit(uint _amount, address _to) external {
        _assessFees();
        totalIdle += _amount;
        userIdle[_to] += _amount;

        emit Deposit(msg.sender, _to, _amount);

        gohm.safeTransferFrom(msg.sender, address(this), _amount);
    }

    function withdraw(uint _amount, address _to) external {
        _assessFees();
        uint idle = userIdle[msg.sender];
        require(_amount <= idle, "exceeds available");

        userIdle[msg.sender] -= _amount;
        totalIdle -= _amount;

        emit Withdraw(msg.sender, _to, _amount);

        gohm.safeTransfer(_to, _amount);
    }

    function borrow(uint _amount, address _to) external {
        _assessFees();
        uint idle = userIdle[msg.sender];
        // assert max borrow == 100% LTV
        require(gohm.balanceFrom(idle) >= _amount, "exceeds LTV");

        uint gOHMAmount = gohm.balanceTo(_amount);
        uint gOHMFee = (borrowRate * gOHMAmount) / 10**FEE_RATE_DECIMALS;
        console.log("gOHM borrow amount", gOHMAmount);
        console.log("gOHM fee", gOHMFee);
        uint gOHMAmountLessFee = gOHMAmount - gOHMFee;

        totalIdle -= gOHMAmount;
        userIdle[msg.sender] -= gOHMAmount;
        userDebts[msg.sender] += _amount;
        totalDebt += _amount;
        feesAvailable += gOHMFee;

        userCollateralShares[msg.sender] += gOHMAmountLessFee;
        totalCollateralShares += gOHMAmountLessFee;
        totalCollateral += gOHMAmountLessFee;

        emit Borrow(msg.sender, _to, _amount);

        argohm.safeTransfer(_to, _amount);
    }

    function repay(uint _amount, address _to) external {
        require(_amount <= userDebts[_to], "repay too much");
        _assessFees();

        uint sharesToRepay = (userCollateralShares[_to] * _amount) / userDebts[_to];
        uint collateralToClaim = (totalCollateral * sharesToRepay) / totalCollateralShares;

        totalCollateral -= collateralToClaim;
        totalIdle += collateralToClaim;
        userIdle[_to] += collateralToClaim;
        totalCollateralShares -= sharesToRepay;
        userCollateralShares[_to] -= sharesToRepay;
        userDebts[_to] -= _amount;
        totalDebt -= _amount;

        emit Repay(msg.sender, _to, _amount);

        argohm.safeTransferFrom(msg.sender, address(this), _amount);
    }

    function selfLiquidate() external {
        _assessFees();
        uint idle = userIdle[msg.sender];
        uint collateral = getCollateral(msg.sender);
        uint debt = userDebts[msg.sender];
        uint debtInGohm = gohm.balanceTo(debt);

        require(debtInGohm <= (idle + collateral));

        if (collateral >= debtInGohm) {
            userIdle[msg.sender] += collateral - debtInGohm;
            totalIdle += collateral - debtInGohm;
        } else {
            userIdle[msg.sender] -= debtInGohm - collateral;
            totalIdle -= debtInGohm - collateral;
        }

        totalCollateral -= collateral;
        totalDebt -= debt;
        userDebts[msg.sender] = 0;
        totalCollateralShares -= userCollateralShares[msg.sender];
        userCollateralShares[msg.sender] = 0;
        /// this isn't really a fee, maybe mint ARGOHM with it?
        feesAvailable += debtInGohm;

        emit Repay(msg.sender, msg.sender, debt);
    }


    function harvestFees() external {
        uint fees = feesAvailable;
        feesAvailable = 0;
        emit FeesHarvested(fees);

        gohm.safeTransfer(treasury, fees);
    }

    /**
     * I dont think this is exactly right, need to do some testing
     * @return amount of gOHM
     */
    function getCollateral(address _account) public view returns(uint) {
        if (userCollateralShares[_account] == 0) return 0;

        console.log("total Collateral", totalCollateral);

        return (totalCollateral * totalCollateralShares) / userCollateralShares[_account];
    }

    function _gohmToOhmAtIndex(uint _gohm, uint _index) internal pure returns (uint) {
        return (_gohm * _index) / (10**18);
    }

    function _ohmToGOhmAtIndex(uint _ohm, uint _index) internal pure returns (uint) {
        return (_ohm * 10**18) / _index;
    }

    function assessFees() external {
        _assessFees();
    }

    /**
     */
    function _assessFees() internal {
        uint newIndex = gohm.index();
        if (newIndex > lastAssessedIndex) {
            uint ohmBefore = (totalCollateral * lastAssessedIndex) / (10**18);
            uint ohmAfter = gohm.balanceFrom(totalCollateral);
            uint ohmGain = ohmAfter - ohmBefore;
            uint ohmFee = (ohmGain * rebaseRate) / 10**FEE_RATE_DECIMALS;
            uint gOHMFee = gohm.balanceTo(ohmFee);

            feesAvailable += gOHMFee;
            totalCollateral -= gOHMFee;
            lastAssessedIndex = newIndex;
        }
    }
}