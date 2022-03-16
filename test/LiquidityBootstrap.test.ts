import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    IERC20,
    LiquidityBootstrap,
    LiquidityBootstrap__factory,
    DebtToken,
    DebtToken__factory,
    ICurveStableSwapPool
} from "../typechain";
import { ethers } from "hardhat";
import { expect } from "chai";
import { forkNetwork, impersonate, forkReset } from "./utils/vm";

const e18 = '0'.repeat(18);
const CRV_FACTORY = "0xB9fC157394Af804a3578134A6585C0dc9cc990d4";
const THREE_CRV = "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490";
const THREE_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";

describe("LiquidityBootstrap", () => {
    let owner: SignerWithAddress;
    let treasury: SignerWithAddress;
    let operator: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let lp: SignerWithAddress;
    let boot: LiquidityBootstrap;
    let debtToken: DebtToken;
    let threeCrv: IERC20;
    let pool: ICurveStableSwapPool;

    beforeEach(async () => {
        await forkNetwork(14388540);
        [owner, treasury, operator, alice, bob] = await ethers.getSigners();

        debtToken = await new DebtToken__factory(owner).deploy(treasury.address);

        let factory = await ethers.getContractAt("ICurveFactory", CRV_FACTORY);
        await factory.deploy_metapool(THREE_POOL, "argo", "argo", debtToken.address, 200, 4000000);
        let poolAddress = await factory.find_pool_for_coins(debtToken.address, THREE_CRV);

        pool = await ethers.getContractAt("ICurveStableSwapPool", poolAddress);
        threeCrv = await ethers.getContractAt("IERC20", THREE_CRV);

        boot = await new LiquidityBootstrap__factory(owner).deploy(
            debtToken.address,
            THREE_CRV,
            pool.address,
            operator.address,
        );

        await debtToken.connect(owner).mint(boot.address, `50000000${e18}`);

        /// has about $6M 3crv
        lp = await impersonate("0xef764bac8a438e7e498c2e5fccf0f174c3e3f8db");

        threeCrv.connect(lp).transfer(alice.address, `1000000${e18}`);
        threeCrv.connect(lp).transfer(bob.address, `1000000${e18}`);
    });

    afterEach(forkReset);

    context("empty pool", () => {
        it("user can add liquidity", async () => {
            const AMOUNT = `10000${e18}`
            await threeCrv.connect(lp).approve(boot.address, AMOUNT);

            let shares = 0; //await boot.previewAdd(AMOUNT)

            await boot.connect(lp).addLiquidity(AMOUNT, shares);

            // no slippage in a test
            expect(await boot.userShares(lp.address)).to.equal("20205034792435384817461");
        });
    });

    context("single LP", () => {
        beforeEach(async () => {
            await threeCrv.connect(lp).approve(boot.address, `10000${e18}`);
            await boot.connect(lp).addLiquidity(`10000${e18}`, "20205034792435384817461");
        });

        it("gives equal shares to the next depositor", async () => {
            await threeCrv.connect(alice).approve(boot.address, `10000${e18}`);
            let shares = await boot.previewAdd(`10000${e18}`)
            await boot.connect(alice).addLiquidity(`10000${e18}`, shares);

            const LP_SHARES = await boot.userShares(lp.address);
            expect(await boot.userShares(alice.address)).to.equal(LP_SHARES);
        });

        it("can preview what the withdraw would be", async () => {
            let shares = await boot.redeemableShares(lp.address);
            let amount = await boot.previewRemove(shares);
            expect(amount[0]).to.equal(`4999999999999999999999`);
            expect(amount[1]).to.equal(`4999999999999999999999`);
        });

        it("can actually withdraw tokens", async () => {
            const THREE_CRV_BEFORE = await threeCrv.balanceOf(lp.address);
            let shares = await boot.redeemableShares(lp.address);
            let amounts = await boot.previewRemove(shares);

            await boot.connect(lp).removeLiquidity(shares, amounts);

            expect(await threeCrv.balanceOf(lp.address)).to.equal(THREE_CRV_BEFORE.add(`4999999999999999999999`));
            expect(await debtToken.balanceOf(lp.address)).to.equal(`4999999999999999999999`);
        });

        it("after withdrawing transfers boost shares to operator", async () => {
            let shares = await boot.redeemableShares(lp.address);
            let amounts = await boot.previewRemove(shares);
            await boot.connect(lp).removeLiquidity(shares, amounts);

            expect(await pool.balanceOf(boot.address)).to.equal(1); // crv leaves dust
            expect(await pool.balanceOf(operator.address)).to.equal(shares);
        });

        it("can redeem LP shares", async () => {
            let shares = await boot.redeemableShares(lp.address);
            await boot.connect(lp).redeemLPShares(shares);
            
            expect(await pool.balanceOf(boot.address)).to.equal(1); // crv leaves dust
            expect(await pool.balanceOf(lp.address)).to.equal(shares);
            expect(await pool.balanceOf(operator.address)).to.equal(shares);
        });

        it("reverts if requesting to remove too many shares", async () => {
            let shares = await boot.redeemableShares(lp.address);
            shares = shares.add(1);
            let amounts = await boot.previewRemove(shares);
            await expect(boot.connect(lp).removeLiquidity(shares, amounts))
                .to.be.revertedWith("insufficient shares");
        });

        it("reverts if requesting to redeem too many shares", async () => {
            let shares = await boot.redeemableShares(lp.address);
            shares = shares.add(1);
            await expect(boot.connect(lp).redeemLPShares(shares))
                .to.be.revertedWith("insufficient shares");
        });
    });
});