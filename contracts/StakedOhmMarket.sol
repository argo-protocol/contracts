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

    /// address -> gohm amount
    mapping(address => uint) public userDeposits;
    /// total gOHM, including not borrowed against
    /// should always match gOHM.balanceOf(address(this))
    uint public totalDeposits;
    /// address -> collateral shares
    /// rebase fees are deducted from totalCollateral
    mapping(address => uint) public userCollateralShares;
    /// total gOHM borrowed against
    uint public totalCollateral;

    /// account -> ARGOHM borrowed
    mapping(address => uint) public userDebts;
    /// total amount of ARGOHM outstanding
    uint public totalDebt;

    uint public lastAssessedIndex;
    uint public feesAvailable; // in gOHM

    IgOHM immutable public gohm;
    IERC20 immutable public argohm;
    address public treasury;
    uint public immutable borrowRate;
    uint public immutable rebaseRate;
    uint public constant FEE_RATE_DECIMALS = 5;

    constructor(address _gohm, address _argohm, address _treasury, uint _borrowRate, uint _rebaseRate) {
        gohm = IgOHM(_gohm);
        argohm = IERC20(_argohm);
        treasury = _treasury;
        borrowRate = _borrowRate;
        rebaseRate = _rebaseRate;
    }
    
    function deposit(uint _amount, address _to) external {
        totalDeposits += _amount;
        userDeposits[_to] += _amount;

        emit Deposit(msg.sender, _to, _amount);

        gohm.safeTransferFrom(msg.sender, address(this), _amount);
    }

    function withdraw(uint _amount, address _to) external {
        uint deposited = userDeposits[msg.sender];
        uint collateralized = userCollateralShares[msg.sender];
        require(_amount <= deposited - collateralized, "exceeds available");

        userDeposits[msg.sender] = deposited - _amount;
        totalDeposits -= _amount;

        emit Withdraw(msg.sender, _to, _amount);

        gohm.safeTransfer(_to, _amount);
    }

    function selfLiquidate(address _to) external {
        // revert if debt greater than balance
        // unwrap portion of OHM to repay debt
        // trasfter debt balance to treasury
        // transfer remainder to _to
    }

    function borrow(uint _amount, address _to) external {
        _assessFees();
        uint collateral = userDeposits[msg.sender] - getCollateral(msg.sender);
        // assert max borrow == 100% LTV
        require(gohm.balanceTo(collateral) >= _amount, "exceeds LTV");

        uint gOHMAmount = gohm.balanceFrom(_amount);
        uint gOHMFee = (borrowRate * gOHMAmount) / 1**FEE_RATE_DECIMALS;

        // assess borrow fee
        userDeposits[msg.sender] -= gOHMFee;
        userCollateralShares[msg.sender] += gOHMAmount - gOHMFee;
        userDebts[msg.sender] += _amount;
        totalDebt += _amount;
        totalDeposits -= gOHMFee;
        totalCollateral += (gOHMAmount - gOHMFee);

        feesAvailable += gOHMFee;

        emit Borrow(msg.sender, _to, _amount);

        argohm.safeTransfer(_to, _amount);
    }

    function repay(uint _amount, address _to) external {
        _assessFees();
        // allow partial repayment
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
        return totalCollateral / userCollateralShares[_account];
    }

    /**
     */
    function _assessFees() internal {
        uint newIndex = gohm.index();
        if (newIndex > lastAssessedIndex) {
            uint indexChange = newIndex - lastAssessedIndex;
            uint feePortion = (indexChange * rebaseRate) / 1**FEE_RATE_DECIMALS;

            uint ohmCollateral = gohm.balanceTo(totalCollateral);
            uint ohmFee = ohmCollateral * feePortion / 1**9; // index has 9 decimals
            uint gOHMFee = gohm.balanceFrom(ohmFee);

            feesAvailable += gOHMFee;
            totalCollateral -= gOHMFee;
            totalDeposits -= gOHMFee;
            lastAssessedIndex = newIndex;
        }
    }
}