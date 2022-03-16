import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    ARGOHM,
    ARGOHM__factory,
    GOHMMock,
    GOHMMock__factory,
    StakedOhmMarket,
    StakedOhmMarket__factory,
} from "../typechain";
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);

const E18 = '000000000000000000'; // 18 zeros
const E9 = '000000000'; // 9 zeros

describe("StakedOhmMarket", () => {
    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let treasury: SignerWithAddress;
    let other: SignerWithAddress;
    let ARGOHM: ARGOHM;
    let gOHM: GOHMMock;
    let market: StakedOhmMarket;

    beforeEach(async () => {
        [owner, treasury, borrower, other] = await ethers.getSigners();
        ARGOHM = await new ARGOHM__factory(owner).deploy(treasury.address);
        gOHM = await new GOHMMock__factory(owner).deploy(
            borrower.address,
            `10000${E18}`,
        )
        market = await new StakedOhmMarket__factory(owner).deploy(
            gOHM.address,
            ARGOHM.address,
            treasury.address,
            5000,
            5000,
        );
    });

    describe("deposit", () => {
        it("transfers gOHM", async () => {
            const DEPOSIT = `100${E18}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);

            expect(await market.totalIdle()).to.equal(DEPOSIT);
            expect(await market.userIdle(borrower.address)).to.equal(DEPOSIT);
        });
    });

    describe("borrow", () => {
        const DEPOSIT = `100${E18}`; // gOHM

        beforeEach(async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
        });

        it("allows a borrow", async () => {
            const AMOUNT = `100${E9}`;

            await market.connect(borrower).borrow(AMOUNT, borrower.address);

            expect(await market.totalIdle()).to.equal(0)
            expect(await market.userIdle(borrower.address)).to.equal(0);
            expect(await market.userDebts(borrower.address)).to.equal(`100${E9}`);
            expect(await market.totalDebt()).to.equal(`100${E9}`);
            expect(await market.userCollateralShares(borrower.address)).to.equal(`95${E18}`);
            expect(await market.totalCollateral()).to.equal(`95${E18}`);
            expect(await market.feesAvailable()).to.equal(`5${E18}`);
        });

        it("allows a partial borrow", async () => {
            const AMOUNT = `20${E9}`;

            await market.connect(borrower).borrow(AMOUNT, borrower.address);

            expect(await market.totalIdle()).to.equal(`80${E18}`);
            expect(await market.userIdle(borrower.address)).to.equal(`80${E18}`);
            expect(await market.userDebts(borrower.address)).to.equal(`20${E9}`);
            expect(await market.totalDebt()).to.equal(`20${E9}`);
            expect(await market.userCollateralShares(borrower.address)).to.equal(`19${E18}`);
            expect(await market.totalCollateral()).to.equal(`19${E18}`);
        });
    });

    describe("assessFees", () => {
        it("assesses rebase fees", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);

            const DEPOSIT = `100${E18}`;
            const BORROW = `100${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);

            expect(await market.userCollateralShares(borrower.address)).to.equal(`95${E18}`);
            expect(await market.totalCollateral()).to.equal(`95${E18}`);
            expect(await gOHM.balanceFrom(`95${E18}`)).to.equal(`95${E9}`);

            await gOHM.setIndex(`2${E9}`);

            await market.assessFees();

            expect(await market.userCollateralShares(borrower.address)).to.equal(`95${E18}`);
            expect(await market.totalCollateral()).to.equal(`92625000000000000000`);
            // index has doubled, so 1 gOHM now worth 2 OHM
            // with a 5% rebase fee, you'll have 1.95 OHM worth of gOHM
            // in this case it is 95 + (0.95 * 95) ==  185.25
            expect(await gOHM.balanceFrom(`92625000000000000000`)).to.equal(`185250000000`);
        });
    });

    describe("repay", () => {
        it("allows completely repaying", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            const BORROW = `100${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);

            await ARGOHM.connect(borrower).approve(market.address, BORROW);
            await market.connect(borrower).repay(BORROW, borrower.address);

            expect(await market.userCollateralShares(borrower.address)).to.equal(0);
            expect(await market.totalCollateral()).to.equal(0);
            expect(await market.totalDebt()).to.equal(0);
        });

        it("allows partially repaying", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            const BORROW = `100${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);

            await ARGOHM.connect(borrower).approve(market.address, BORROW);
            expect(await market.totalCollateral()).to.equal(`95${E18}`);
            await market.connect(borrower).repay(`50${E9}`, borrower.address);

            expect(await market.userCollateralShares(borrower.address)).to.equal(`47500000000000000000`);
            expect(await market.totalCollateral()).to.equal(`47500000000000000000`);
            expect(await market.totalDebt()).to.equal(`50${E9}`);
        });

        it("correctly partially repays after several rebases", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            const BORROW = `100${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);

            await ARGOHM.connect(borrower).approve(market.address, BORROW);
            expect(await market.totalCollateral()).to.equal(`95${E18}`);

            await gOHM.setIndex(`2${E9}`);

            await market.connect(borrower).repay(`50${E9}`, borrower.address);

            expect(await market.userCollateralShares(borrower.address)).to.equal(`47500000000000000000`);
            expect(await market.totalCollateral()).to.equal(`46312500000000000000`);
            expect(await market.totalDebt()).to.equal(`50${E9}`);
        });

        it("correctly fully repays after several rebases", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            const BORROW = `100${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);

            expect(await market.totalCollateral()).to.equal(`95${E18}`);
            await gOHM.setIndex(`2${E9}`);

            await ARGOHM.connect(borrower).approve(market.address, BORROW);
            await market.connect(borrower).repay(BORROW, borrower.address);

            expect(await market.userCollateralShares(borrower.address)).to.equal(0);
            expect(await market.totalCollateral()).to.equal(0);
            expect(await market.totalDebt()).to.equal(0);
        });
    });

    describe("self-liquidate", () => {
        it("can self liquidate with enough deposits", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            const BORROW = `100${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);
            await gOHM.setIndex(`2${E9}`);

            await market.connect(borrower).selfLiquidate();

            expect(await market.userCollateralShares(borrower.address)).to.equal(0);
            expect(await market.totalCollateral()).to.equal(0);
            expect(await market.totalDebt()).to.equal(0);
            expect(await market.totalIdle()).to.equal('42625000000000000000');
            expect(await market.userIdle(borrower.address)).to.equal('42625000000000000000');
        });

        it("will fail to self-liquidate if not enough deposits", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            const BORROW = `100${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);

            await expect(market.connect(borrower).selfLiquidate()).to.be.reverted;
        });

        it("can self-liquidate using both collateral and idle gOHM", async () => {
            await ARGOHM.connect(owner).mint(market.address, `1000${E9}`);
            const DEPOSIT = `100${E18}`;
            const BORROW = `50${E9}`;
            await gOHM.connect(borrower).approve(market.address, DEPOSIT);
            await market.connect(borrower).deposit(DEPOSIT, borrower.address);
            await market.connect(borrower).borrow(BORROW, borrower.address);

            await market.connect(borrower).selfLiquidate();

            expect(await market.userCollateralShares(borrower.address)).to.equal(0);
            expect(await market.totalCollateral()).to.equal(0);
            expect(await market.totalDebt()).to.equal(0);
        });
    });
});