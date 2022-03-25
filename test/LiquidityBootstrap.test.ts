import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    IERC20,
    LiquidityBootstrap,
    LiquidityBootstrap__factory,
    LiquidityBootstrapVNext,
    LiquidityBootstrapVNext__factory,
    DebtToken,
    DebtToken__factory,
    ICurveStableSwapPool,
    ICurveGaugeV3,
    IStakingRewards,
} from "../typechain";
import { ethers } from "hardhat";
import { expect } from "chai";
import { forkNetwork, impersonate, forkReset, setStorageAt, getStorageAt } from "./utils/vm";
import { BigNumber } from "ethers";

const e18 = '0'.repeat(18);
const CRV_FACTORY = "0xB9fC157394Af804a3578134A6585C0dc9cc990d4";
const THREE_CRV = "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490";
const THREE_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const TRICRYPTO_GAUGE = "0x6955a55416a06839309018A8B0cB72c4DDC11f15";
const TRICRYPTO_REWARDS = "";
const ALUSD_GAUGE = "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477";
const ALUSD_STAKING = "0xB76256d1091E93976C61449d6e500D9f46d827D4";

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
    let gauge: ICurveGaugeV3;
    let staking: IStakingRewards;

    beforeEach(async () => {
        await forkNetwork(14388540);
        [owner, treasury, operator, alice, bob] = await ethers.getSigners();

        debtToken = await new DebtToken__factory(owner).deploy(treasury.address);

        let factory = await ethers.getContractAt("ICurveFactory", CRV_FACTORY);
        await factory.deploy_metapool(THREE_POOL, "argo", "argo", debtToken.address, 200, 4000000);
        let poolAddress = await factory.find_pool_for_coins(debtToken.address, THREE_CRV);

        pool = await ethers.getContractAt("ICurveStableSwapPool", poolAddress);
        threeCrv = await ethers.getContractAt("IERC20", THREE_CRV);
        gauge = await ethers.getContractAt("ICurveGaugeV3", TRICRYPTO_GAUGE);
        // gauge = await ethers.getContractAt("ICurveGaugeV3", ALUSD_GAUGE);
        // staking = await ethers.getContractAt("IStakingRewards", ALUSD_STAKING);
        // console.log(await gauge.lp_token());
        // for (let i = 14; i < 15; i++) {
        //     let x = await getStorageAt(gauge.address, `0x${i}`)
        //     let n = BigNumber.from(x);
        //     let m = n.mod("1461501637330902918203684832716283019655932542976"); // 2**160
        //     let tl = n.shl(160);
        //     let tr = n.shr(160);
        //     let alcxStaking = await ethers.getContractAt("IStakingRewards", m.toHexString());
        //     await setStorageAt(alcxStaking.address, "0x6", `0x${'0'.repeat(24)}${pool.address.replace("0x", "")}`);
        //     expect(await alcxStaking.stakingToken()).to.equal(pool.address);
        // }


        /// hijack the TRICRYPTO gauge for our LP token
        await setStorageAt(gauge.address, "0x2", `0x${'0'.repeat(24)}${pool.address.replace("0x", "")}`);
        expect(await gauge.lp_token()).to.equal(pool.address);



        // /// hijack the staking rewards contract as well
        // await setStorageAt(staking.address, "0x6", `0x${'0'.repeat(24)}${pool.address.replace("0x", "")}`);
        // expect(await staking.stakingToken()).to.equal(pool.address);
        // console.log("get staking token")
        // console.log(await staking.stakingToken());
        // console.log(0, await getStorageAt(staking.address, "0x0"));
        // console.log(1, await getStorageAt(staking.address, "0x1"));
        // console.log(2, await getStorageAt(staking.address, "0x2"));
        // console.log(3, await getStorageAt(staking.address, "0x3"));
        // console.log(4, await getStorageAt(staking.address, "0x4"));
        // console.log(5, await getStorageAt(staking.address, "0x5"));
        // console.log(6, await getStorageAt(staking.address, "0x6"));
        // console.log(7, await getStorageAt(staking.address, "0x7"));


        boot = await new LiquidityBootstrap__factory(owner).deploy(
            debtToken.address,
            THREE_CRV,
            pool.address,
            gauge.address,
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

            await boot.connect(lp).createLPShares(AMOUNT, shares);

            // no slippage in a test
            expect(await boot.userShares(lp.address)).to.equal("20205034792435384817461");
        });
    });

    context("single LP", () => {
        beforeEach(async () => {
            await threeCrv.connect(lp).approve(boot.address, `10000${e18}`);
            await boot.connect(lp).createLPShares(`10000${e18}`, "20205034792435384817461");
        });

        it("gives equal shares to the next depositor", async () => {
            await threeCrv.connect(alice).approve(boot.address, `10000${e18}`);
            let shares = await boot.previewAdd(`10000${e18}`)
            await boot.connect(alice).createLPShares(`10000${e18}`, shares);

            const LP_SHARES = await boot.userShares(lp.address);
            expect(await boot.userShares(alice.address)).to.equal(LP_SHARES);
        });

        it("can preview what the redemption would be", async () => {
            let shares = await boot.ownedShares(lp.address);
            let amount = await boot.previewRemove(shares);
            expect(amount[0]).to.equal(`4999999999999999999999`);
            expect(amount[1]).to.equal(`4999999999999999999999`);
        });

        it("can redeem LP shares for tokens", async () => {
            const THREE_CRV_BEFORE = await threeCrv.balanceOf(lp.address);
            let shares = await boot.ownedShares(lp.address);
            let amounts = await boot.previewRemove(shares);

            await boot.connect(lp).redeemLPShares(shares, amounts);

            expect(await threeCrv.balanceOf(lp.address)).to.equal(THREE_CRV_BEFORE.add(`4999999999999999999999`));
            expect(await debtToken.balanceOf(lp.address)).to.equal(`4999999999999999999999`);
        });

        it("after redeeming transfers boost shares to operator", async () => {
            let shares = await boot.ownedShares(lp.address);
            let amounts = await boot.previewRemove(shares);
            await boot.connect(lp).redeemLPShares(shares, amounts);

            expect(await pool.balanceOf(boot.address)).to.equal(0); // crv leaves dust
            expect(await pool.balanceOf(operator.address)).to.equal(shares);
        });

        it("can withdraw LP shares", async () => {
            let shares = await boot.ownedShares(lp.address);
            await boot.connect(lp).withdrawLPShares(shares);
            
            expect(await pool.balanceOf(boot.address)).to.equal(0); // crv leaves dust
            expect(await pool.balanceOf(lp.address)).to.equal(shares);
            expect(await pool.balanceOf(operator.address)).to.equal(shares);
            expect(await boot.userShares(lp.address)).to.equal(1);
            expect(await boot.totalShares()).to.equal(1);
        });

        it("reverts if requesting to redeem too many shares", async () => {
            let shares = await boot.ownedShares(lp.address);
            shares = shares.add(1);
            let amounts = await boot.previewRemove(shares);
            await expect(boot.connect(lp).redeemLPShares(shares, amounts))
                .to.be.revertedWith("insufficient shares");
        });

        it("reverts if requesting to withdraw too many shares", async () => {
            let shares = await boot.ownedShares(lp.address);
            shares = shares.add(1);
            await expect(boot.connect(lp).withdrawLPShares(shares))
                .to.be.revertedWith("insufficient shares");
        });
    });

    describe("setOperator", () => {
        it("updates the operator", async () => {
            await expect(boot.connect(owner).setOperator(bob.address))
                .to.emit(boot, "SetOperator").withArgs(bob.address);
            
            expect(await boot.operator()).to.equal(bob.address);
        });

        it("reverts if proposed operator is zero address", async () => {
            await expect(boot.connect(owner).setOperator(ethers.constants.AddressZero))
                .to.be.revertedWith("0x0");
        });

        it("reverts if called by not owner", async () => {
            await expect(boot.connect(bob).setOperator(bob.address))
                .to.be.revertedWith("Ownable");
        });
    });

    describe("migrate", () => {
        let boot2: LiquidityBootstrapVNext;

        beforeEach(async () => {
            const AMOUNT = `10000${e18}`
            await threeCrv.connect(lp).approve(boot.address, AMOUNT);
            await boot.connect(lp).createLPShares(AMOUNT, 0);
            boot2 = await new LiquidityBootstrapVNext__factory(owner).deploy(boot.address);
        });

        it("will move liquidity to the new contract", async () => {
            let shares = await boot.userShares(lp.address);
            await expect(boot.connect(owner).setMigrationTarget(boot2.address))
                .to.emit(boot, "SetMigrationTarget").withArgs(boot2.address);
            await expect(boot2.connect(lp).migrate())
                .to.emit(boot, "WithdrawLP").withArgs(lp.address, shares);

            expect(await boot.userShares(lp.address)).to.equal(0);
            expect(await boot.totalShares()).to.equal(0);
            expect(await boot2.userShares(lp.address)).to.equal(shares);
            expect(await boot2.totalShares()).to.equal(shares);
            expect(await pool.balanceOf(boot2.address)).to.equal(shares);
        });

        it("will revert if msg.sender isn't migrationTarget", async () => {
            await boot.connect(owner).setMigrationTarget(boot2.address);
            await expect(boot.connect(bob).migrate(lp.address))
                .to.be.revertedWith("invalid caller");
        });

        it("will revert if user has no shares", async () => {
            await boot.connect(owner).setMigrationTarget(boot2.address);
            await expect(boot2.connect(bob).migrate())
                .to.be.revertedWith("insufficient shares");
        });

        it("will revert if no migration target set", async () => {
            await expect(boot2.connect(lp).migrate())
                .to.be.revertedWith("0x0 target");
        });

        it("will revert if non owner attempts to set migration target", async () => {
            await expect(boot.connect(bob).setMigrationTarget(boot2.address))
                .to.be.revertedWith("Ownable");
        });
    })
});