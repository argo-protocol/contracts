import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    IOracle,
    IPSM,
    ZeroInterestMarket,
    DebtToken,
    DebtToken__factory,
    MarketFactory__factory,
    MainnetgOhmLiquidatorV1,
    MainnetgOhmLiquidatorV1__factory,
    StubOracle__factory,
    PegStability__factory,
    MainnetgOHMOracle__factory,
    IERC20,
    StubOracle,
    PegStability,
} from "../../typechain";
import { ethers } from "hardhat";
import { expect } from "chai";
import { forkNetwork, forkReset, impersonate } from "../utils/vm";
import { BigNumber } from "ethers";

const E18 = "000000000000000000";
const GOHM_ADDRESS = "0x0ab87046fBb341D058F17CBC4c1133F25a20a52f";
const OHM_ADDRESS = "0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D5";
const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const SUSHI_ROUTER_ADDRESS = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
const OLYMPUS_STAKING_ADDRESS = "0xb63cac384247597756545b500253ff8e607a8020";
const GOHM_WHALE = "0x33Ed792326EDc9e826B4E0ef64594AB3d8D00Acc";

describe("MainnetgOhmLiquidator", () => {
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let whale: SignerWithAddress;
    let market: ZeroInterestMarket;
    let oracle: StubOracle;
    let debtToken: DebtToken;
    let gOHM: IERC20;
    let dai: IERC20;
    let psm: PegStability;
    let liquidator: MainnetgOhmLiquidatorV1;

    beforeEach(async () => {
        await forkNetwork();

        [owner, alice, bob] = await ethers.getSigners();

        /// TODO: is there a way to use our deploy scripts here?
        debtToken = await new DebtToken__factory(owner).deploy(owner.address);
        oracle = await new StubOracle__factory(owner).deploy();
        let marketFactory = await new MarketFactory__factory(owner).deploy(owner.address);
        await marketFactory.createZeroInterestMarket(
            owner.address,
            GOHM_ADDRESS,
            debtToken.address,
            oracle.address,
            60000, // loan-to-value (60%)
            1500, // borrow rate (1.5%)
            10000 // liquidation penalty (10%)
        );
        let marketAddress = await marketFactory.markets(0);
        market = await (await ethers.getContractFactory("ZeroInterestMarket")).attach(marketAddress);
        psm = await new PegStability__factory(owner).deploy(
            debtToken.address,
            DAI_ADDRESS,
            250, // buy fee 0.25%
            250, // sell fee 0.25%
            owner.address
        );
        await debtToken.mint(market.address, `10000000${E18}`);
        await debtToken.mint(psm.address, `10000000${E18}`);

        liquidator = await new MainnetgOhmLiquidatorV1__factory(owner).deploy(
            market.address,
            OLYMPUS_STAKING_ADDRESS,
            oracle.address,
            SUSHI_ROUTER_ADDRESS,
            OHM_ADDRESS,
            DAI_ADDRESS,
            psm.address
        );

        gOHM = await (await ethers.getContractFactory("ERC20")).attach(GOHM_ADDRESS);
        dai = await (await ethers.getContractFactory("ERC20")).attach(DAI_ADDRESS);
        whale = await impersonate(GOHM_WHALE);
    });

    afterEach(async () => {
        await forkReset();
    });

    it("can liquidate a bad loan", async () => {
        await oracle.setPrice(`10000${E18}`);
        const BORROW_AMOUNT = `290000${E18}`;
        const COLLATERAL_AMOUNT = `50${E18}`;
        await gOHM.connect(whale).approve(market.address, COLLATERAL_AMOUNT);
        await market.connect(whale).depositAndBorrow(COLLATERAL_AMOUNT, BORROW_AMOUNT);

        await oracle.setPrice(`5000${E18}`);
        await liquidator.connect(alice).liquidate(whale.address, BORROW_AMOUNT, `500${E18}`, alice.address);
    });

    it("can send liquidation profits elsewhere", async () => {
        await oracle.setPrice(`10000${E18}`);
        const BORROW_AMOUNT = `290000${E18}`;
        const COLLATERAL_AMOUNT = `50${E18}`;
        await gOHM.connect(whale).approve(market.address, COLLATERAL_AMOUNT);
        await market.connect(whale).depositAndBorrow(COLLATERAL_AMOUNT, BORROW_AMOUNT);

        const MIN_PROFIT = BigNumber.from(`500${E18}`);
        await oracle.setPrice(`5000${E18}`);
        await liquidator.connect(bob).liquidate(whale.address, BORROW_AMOUNT, MIN_PROFIT, bob.address);

        const actualProfit = await debtToken.balanceOf(bob.address);
        expect(actualProfit.gte(MIN_PROFIT)).to.be.true;
    });
});
