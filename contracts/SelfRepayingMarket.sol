// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import { IOracle } from "./interfaces/IOracle.sol";
import { IDebtToken } from "./interfaces/IDebtToken.sol";
import { IFlashSwap } from "./interfaces/IFlashSwap.sol";
import { IERC4626 } from "./interfaces/IERC4626.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract SelfRepayingMarket is Ownable, Initializable {
    using SafeERC20 for IERC20;

    event Deposit(address indexed from, address indexed to, uint256 amount);
    event Withdraw(address indexed from, address indexed to, uint256 amount);
    event Borrow(address indexed from, address indexed to, uint256 amount);
    event Repay(address indexed from, address indexed to, uint256 amount);
    event Liquidate(address indexed from, address indexed to, uint256 repayDebt, uint256 liquidatedCollateral, uint256 liquidationPrice);
    event TreasuryUpdated(address newTreasury);
    event LastPriceUpdated(uint price);
    event FeesHarvested(uint fees);    

    IERC20 public collateralToken;
    IERC4626 public vaultToken;
    IERC20 public debtToken;
    IOracle public oracle;

    mapping(address => uint256) public userCollateral;
    uint256 public totalCollateral;
    uint256 public totalShares;

    mapping(address => uint256) public userDebt;
    uint256 public totalDebt;

    address public treasury;
    uint256 public feesCollected;

    uint constant public PRECISION = 1e5;
    uint256 public maxLoanToValue;
    uint256 public borrowRate;
    uint256 public yieldRate;
    uint256 public liquidationPenalty;

    function initialize(
        address _owner,
        address _treasury,
        address _collateralToken,
        address _vaultToken,
        address _debtToken,
        address _oracle,
        uint256 _maxLoanToValue,
        uint256 _borrowRate,
        uint256 _yieldRate,
        uint256 _liquidationPenalty
    ) public initializer {
        treasury = _treasury;
        collateralToken = IERC20(_collateralToken);
        vaultToken = IERC4626(_vaultToken);
        debtToken = IDebtToken(_debtToken);
        oracle = IOracle(_oracle);
        maxLoanToValue = _maxLoanToValue;
        borrowRate = _borrowRate;
        yieldRate = _yieldRate;
        liquidationPenalty = _liquidationPenalty;
        Ownable._transferOwnership(_owner);

        emit TreasuryUpdated(_treasury);
    }

    function deposit(address _to, uint256 _amount) external {
        totalCollateral += _amount;
        userCollateral[_to] += _amount;

        emit Deposit(msg.sender, _to, _amount);

        collateralToken.safeTransferFrom(msg.sender, address(this), _amount);
        collateralToken.safeApprove(address(vaultToken), _amount);
        vaultToken.deposit(_amount, address(this));
    }

    function withdraw(address _to, uint256 _amount) external {
        totalCollateral -= _amount;
        userCollateral[_to] -= _amount;
        
        emit Withdraw(msg.sender, _to, _amount);

        vaultToken.withdraw(_amount, _to, address(this));
    }

    function borrow(address _to, uint256 _amount) external {
        uint fee = _amount * borrowRate / PRECISION;
        uint amountPlusFee = _amount + fee;
        feesCollected += fee;
        totalDebt += amountPlusFee;
        userDebt[msg.sender] += amountPlusFee;

        emit Borrow(msg.sender, _to, amountPlusFee);
        debtToken.transfer(_to, _amount);
    }

    function harvest(IFlashSwap swapper) external {
        /// TODO: track shares in the contract
        uint256 shares = vaultToken.balanceOf(address(this));
        uint256 underlying = vaultToken.previewRedeem(shares);

        if (underlying > totalCollateral) {
            uint256 yield = underlying - totalCollateral;
            uint256 fee = yield * yieldRate / PRECISION;

            swapper.swap(collateralToken, debtToken, address(this), 0, yield - fee);
            
            // TODO: how much ARGO did we get?
            // How do we do the accounting for this? 
        }
    }
}