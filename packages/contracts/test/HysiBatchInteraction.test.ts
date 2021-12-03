import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import bluebird from "bluebird";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, waffle } from "hardhat";
import HysiBatchInteractionAdapter from "../adapters/HYSIBatchInteraction/HYSIBatchInteractionAdapter";
import { MockCurveMetapool, MockERC20, MockYearnV2Vault } from "../typechain";
import { HysiBatchInteraction } from "../typechain/HysiBatchInteraction";
import { MockBasicIssuanceModule } from "../typechain/MockBasicIssuanceModule";

const provider = waffle.provider;

interface Contracts {
  mock3Crv: MockERC20;
  mockPop: MockERC20;
  mockCrvUSDX: MockERC20;
  mockCrvUST: MockERC20;
  mockSetToken: MockERC20;
  mockYearnVaultUSDX: MockYearnV2Vault;
  mockYearnVaultUST: MockYearnV2Vault;
  mockCurveMetapoolUSDX: MockCurveMetapool;
  mockCurveMetapoolUST: MockCurveMetapool;
  mockBasicIssuanceModule: MockBasicIssuanceModule;
  hysiBatchInteraction: HysiBatchInteraction;
}

enum BatchType {
  Mint,
  Redeem,
}

const DAY = 60 * 60 * 24;

const DepositorInitial = parseEther("100000");
let owner: SignerWithAddress,
  depositor: SignerWithAddress,
  depositor1: SignerWithAddress,
  depositor2: SignerWithAddress,
  depositor3: SignerWithAddress,
  zapper: SignerWithAddress;
let contracts: Contracts;

async function deployContracts(): Promise<Contracts> {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mock3Crv = await (
    await MockERC20.deploy("3Crv", "3Crv", 18)
  ).deployed();
  const mockBasicCoin = await (
    await MockERC20.deploy("Basic", "Basic", 18)
  ).deployed();
  const mockPop = await (await MockERC20.deploy("POP", "POP", 18)).deployed();
  await mock3Crv.mint(depositor.address, DepositorInitial);
  await mock3Crv.mint(depositor1.address, DepositorInitial);
  await mock3Crv.mint(depositor2.address, DepositorInitial);
  await mock3Crv.mint(depositor3.address, DepositorInitial);

  const mockCrvUSDX = await (
    await MockERC20.deploy("crvUSDX", "crvUSDX", 18)
  ).deployed();
  const mockCrvUST = await (
    await MockERC20.deploy("crvUST", "crvUST", 18)
  ).deployed();
  const mockSetToken = await await MockERC20.deploy("setToken", "setToken", 18);

  const MockYearnV2Vault = await ethers.getContractFactory("MockYearnV2Vault");
  const mockYearnVaultUSDX = await (
    await MockYearnV2Vault.deploy(mockCrvUSDX.address)
  ).deployed();
  const mockYearnVaultUST = await (
    await MockYearnV2Vault.deploy(mockCrvUST.address)
  ).deployed();

  const MockCurveMetapool = await ethers.getContractFactory(
    "MockCurveMetapool"
  );

  //Besides crvUSDX and 3Crv no coins are needed in this test which is why i used the same token in the other places
  const mockCurveMetapoolUSDX = await (
    await MockCurveMetapool.deploy(
      mockBasicCoin.address,
      mockCrvUSDX.address,
      mock3Crv.address,
      mockBasicCoin.address,
      mockBasicCoin.address,
      mockBasicCoin.address
    )
  ).deployed();
  const mockCurveMetapoolUST = await (
    await MockCurveMetapool.deploy(
      mockBasicCoin.address,
      mockCrvUST.address,
      mock3Crv.address,
      mockBasicCoin.address,
      mockBasicCoin.address,
      mockBasicCoin.address
    )
  ).deployed();

  const mockBasicIssuanceModule = (await (
    await (await ethers.getContractFactory("MockBasicIssuanceModule")).deploy(
      [mockYearnVaultUSDX.address, mockYearnVaultUST.address],
      [50, 50]
    )
  ).deployed()) as MockBasicIssuanceModule;

  const aclRegistry = await (
    await (await ethers.getContractFactory("ACLRegistry")).deploy()
  ).deployed();

  const contractRegistry = await (
    await (await ethers.getContractFactory("ContractRegistry")).deploy(
      aclRegistry.address
    )
  ).deployed();

  const keeperIncentive = await (
    await (await ethers.getContractFactory("KeeperIncentive")).deploy(
      contractRegistry.address,
      0,
      0
    )
  ).deployed();

  const staking = await (
    await (await ethers.getContractFactory("Staking")).deploy(
      contractRegistry.address
    )
  ).deployed();

  const hysiBatchInteraction = (await (
    await (await ethers.getContractFactory("HysiBatchInteraction")).deploy(
      contractRegistry.address,
      mockSetToken.address,
      mock3Crv.address,
      mockBasicIssuanceModule.address,
      [mockYearnVaultUSDX.address, mockYearnVaultUST.address],
      [
        {
          curveMetaPool: mockCurveMetapoolUSDX.address,
          crvLPToken: mockCrvUSDX.address,
        },
        {
          curveMetaPool: mockCurveMetapoolUST.address,
          crvLPToken: mockCrvUST.address,
        },
      ],
      1800,
      parseEther("20000"),
      parseEther("200")
    )
  ).deployed()) as HysiBatchInteraction;

  await aclRegistry.grantRole(ethers.utils.id("DAO"), owner.address);
  await aclRegistry.grantRole(ethers.utils.id("Keeper"), owner.address);

  await contractRegistry
    .connect(owner)
    .addContract(ethers.utils.id("POP"), mockPop.address, ethers.utils.id("1"));
  await contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("KeeperIncentive"),
      keeperIncentive.address,
      ethers.utils.id("1")
    );
  await contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("Staking"),
      staking.address,
      ethers.utils.id("1")
    );

  await keeperIncentive
    .connect(owner)
    .createIncentive(
      utils.formatBytes32String("HysiBatchInteraction"),
      0,
      true,
      false
    );

  await keeperIncentive
    .connect(owner)
    .createIncentive(
      utils.formatBytes32String("HysiBatchInteraction"),
      0,
      true,
      false
    );

  await keeperIncentive
    .connect(owner)
    .addControllerContract(
      utils.formatBytes32String("HysiBatchInteraction"),
      hysiBatchInteraction.address
    );

  return {
    mock3Crv,
    mockPop,
    mockCrvUSDX,
    mockCrvUST,
    mockSetToken,
    mockYearnVaultUSDX,
    mockYearnVaultUST,
    mockCurveMetapoolUSDX,
    mockCurveMetapoolUST,
    mockBasicIssuanceModule,
    hysiBatchInteraction,
  };
}

const timeTravel = async (time: number) => {
  await provider.send("evm_increaseTime", [time]);
  await provider.send("evm_mine", []);
};

const deployAndAssignContracts = async () => {
  [
    owner,
    depositor,
    depositor1,
    depositor2,
    depositor3,
    zapper,
  ] = await ethers.getSigners();
  contracts = await deployContracts();
  await contracts.mock3Crv
    .connect(depositor)
    .approve(contracts.hysiBatchInteraction.address, parseEther("100000000"));
};

describe("HysiBatchInteraction", function () {
  beforeEach(async function () {
    await deployAndAssignContracts();
  });
  context("setters and getters", () => {
    describe("setCurvePoolTokenPairs", () => {
      it("sets curve pool token pairs", async () => {
        const YUST_TOKEN_ADDRESS = "0x1c6a9783f812b3af3abbf7de64c3cd7cc7d1af44";
        const UST_METAPOOL_ADDRESS =
          "0x890f4e345B1dAED0367A877a1612f86A1f86985f";
        const CRV_UST_TOKEN_ADDRESS =
          "0x94e131324b6054c0D789b190b2dAC504e4361b53";
        await contracts.hysiBatchInteraction
          .connect(owner)
          .setCurvePoolTokenPairs(
            [YUST_TOKEN_ADDRESS],
            [
              {
                curveMetaPool: UST_METAPOOL_ADDRESS,
                crvLPToken: CRV_UST_TOKEN_ADDRESS,
              },
            ]
          );
        expect(
          await contracts.hysiBatchInteraction.curvePoolTokenPairs(
            YUST_TOKEN_ADDRESS
          )
        ).to.deep.eq([UST_METAPOOL_ADDRESS, CRV_UST_TOKEN_ADDRESS]);
      });
    });
    describe("setBatchCooldown", () => {
      it("sets batch cooldown period", async () => {
        await contracts.hysiBatchInteraction.setBatchCooldown(52414);
        expect(await contracts.hysiBatchInteraction.batchCooldown()).to.equal(
          BigNumber.from("52414")
        );
      });
      it("should revert if not owner", async function () {
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .setBatchCooldown(52414)
        ).to.be.revertedWith("you dont have the right role");
      });
    });
    describe("setMintThreshold", () => {
      it("sets mint threshold", async () => {
        await contracts.hysiBatchInteraction.setMintThreshold(
          parseEther("100342312")
        );
        expect(await contracts.hysiBatchInteraction.mintThreshold()).to.equal(
          parseEther("100342312")
        );
      });
      it("should revert if not owner", async function () {
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .setMintThreshold(parseEther("100342312"))
        ).to.be.revertedWith("you dont have the right role");
      });
    });
    describe("setRedeemThreshold", () => {
      it("sets redeem threshold", async () => {
        await contracts.hysiBatchInteraction.setRedeemThreshold(
          parseEther("100342312")
        );
        expect(await contracts.hysiBatchInteraction.redeemThreshold()).to.equal(
          parseEther("100342312")
        );
      });
      it("should revert if not owner", async function () {
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .setRedeemThreshold(parseEther("100342312"))
        ).to.be.revertedWith("you dont have the right role");
      });
    });
  });
  context("batch generation", () => {
    describe("mint batch generation", () => {
      it("should set a non-zero batchId when initialized", async () => {
        const batchId0 = await contracts.hysiBatchInteraction.batchIds(0);
        const adapter = new HysiBatchInteractionAdapter(
          contracts.hysiBatchInteraction
        );
        const batch = await adapter.getBatch(batchId0);
        expect(
          batch.batchId.match(
            /0x.+[^0x0000000000000000000000000000000000000000000000000000000000000000]/
          )?.length
        ).equal(1);
      });
      it("should set batch struct properties when the contract is deployed", async () => {
        const batchId0 = await contracts.hysiBatchInteraction.batchIds(0);
        const adapter = new HysiBatchInteractionAdapter(
          contracts.hysiBatchInteraction
        );
        const batch = await adapter.getBatch(batchId0);
        expect(batch).to.deep.contain({
          batchType: BatchType.Mint,
          claimable: false,
          claimableTokenAddress: contracts.mockSetToken.address,
          suppliedTokenAddress: contracts.mock3Crv.address,
        });
        expect(batch.claimableTokenBalance).to.equal(BigNumber.from(0));
        expect(batch.unclaimedShares).to.equal(BigNumber.from(0));
        expect(batch.suppliedTokenBalance).to.equal(BigNumber.from(0));
      });
    });
    describe("redeem batch generation", () => {
      it("should set a non-zero batchId when initialized", async () => {
        const batchId1 = await contracts.hysiBatchInteraction.batchIds(1);
        const adapter = new HysiBatchInteractionAdapter(
          contracts.hysiBatchInteraction
        );
        const batch = await adapter.getBatch(batchId1);
        expect(
          batch.batchId.match(
            /0x.+[^0x0000000000000000000000000000000000000000000000000000000000000000]/
          )?.length
        ).equal(1);
      });
      it("should set batch struct properties when the contract is deployed", async () => {
        const batchId1 = await contracts.hysiBatchInteraction.batchIds(1);
        const adapter = new HysiBatchInteractionAdapter(
          contracts.hysiBatchInteraction
        );
        const batch = await adapter.getBatch(batchId1);

        expect(batch).to.deep.contain({
          batchType: BatchType.Redeem,
          claimable: false,
          claimableTokenAddress: contracts.mock3Crv.address,
          suppliedTokenAddress: contracts.mockSetToken.address,
        });
        expect(batch.claimableTokenBalance).to.equal(BigNumber.from(0));
        expect(batch.unclaimedShares).to.equal(BigNumber.from(0));
        expect(batch.suppliedTokenBalance).to.equal(BigNumber.from(0));
      });
    });
  });
  describe("minting", function () {
    context("depositing", function () {
      describe("batch struct", () => {
        const deposit = async (amount?: number) => {
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(
              parseEther(amount ? amount.toString() : "10"),
              depositor.address
            );
        };

        const subject = async (batchId) => {
          const adapter = new HysiBatchInteractionAdapter(
            contracts.hysiBatchInteraction
          );
          const batch = await adapter.getBatch(batchId);
          return batch;
        };

        it("increments suppliedTokenBalance and unclaimedShares with deposit", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          await deposit(10);
          expect(await subject(batchId)).to.deep.contain({
            suppliedTokenBalance: parseEther("10"),
            unclaimedShares: parseEther("10"),
          });
        });
        it("depositing does not make a batch claimable", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          await deposit(10);
          expect(await subject(batchId)).to.deep.contain({
            claimable: false,
          });
        });
        it("increments suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          await deposit(); // 10
          await deposit(); // 10
          await deposit(); // 10
          expect(await subject(batchId)).to.deep.contain({
            claimableTokenBalance: parseEther("0"),
            suppliedTokenBalance: parseEther("30"),
            unclaimedShares: parseEther("30"),
          });
        });
        it("increments claimableTokenBalance when batch is minted", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to mint batch
          await contracts.hysiBatchInteraction.batchMint(0);
          const batchHysiOwned = await contracts.mockSetToken.balanceOf(
            contracts.hysiBatchInteraction.address
          );
          expect(await subject(batchId)).to.deep.contain({
            claimableTokenBalance: batchHysiOwned,
            suppliedTokenBalance: parseEther("10"),
            unclaimedShares: parseEther("10"),
          });
        });
        it("sets batch to claimable when batch is minted", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to mint batch
          await contracts.hysiBatchInteraction.batchMint(0);
          expect(await subject(batchId)).to.deep.contain({
            claimable: true,
          });
        });
        it("decrements unclaimedShares and claimable when claim is made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to mint batch
          await contracts.hysiBatchInteraction.batchMint(0);
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address);

          expect(await subject(batchId)).to.deep.contain({
            claimable: true,
            unclaimedShares: parseEther("0"),
            claimableTokenBalance: parseEther("0"),
          });
        });
      });

      it("deposits 3crv in the current mintBatch", async function () {
        const result = await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        expect(result)
          .to.emit(contracts.hysiBatchInteraction, "Deposit")
          .withArgs(depositor.address, parseEther("10000"));
        expect(
          await contracts.mock3Crv.balanceOf(
            contracts.hysiBatchInteraction.address
          )
        ).to.equal(parseEther("10000"));
        const currentMintBatchId = await contracts.hysiBatchInteraction.currentMintBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentMintBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("10000"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("10000"));
      });
      it("adds the mintBatch to the users batches", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);

        const currentMintBatchId = await contracts.hysiBatchInteraction.currentMintBatchId();
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentMintBatchId);
      });
      it("allows multiple deposits", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        await contracts.mock3Crv
          .connect(depositor1)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor1)
          .depositForMint(parseEther("10000"), depositor1.address);
        await contracts.mock3Crv
          .connect(depositor2)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForMint(parseEther("5000"), depositor2.address);
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForMint(parseEther("5000"), depositor2.address);
        const currentMintBatchId = await contracts.hysiBatchInteraction.currentMintBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentMintBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("30000"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("30000"));
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentMintBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor1.address,
            0
          )
        ).to.equal(currentMintBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor2.address,
            0
          )
        ).to.equal(currentMintBatchId);
      });
    });
    context("batch minting", function () {
      context("reverts", function () {
        it("reverts when minting too early", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.hysiBatchInteraction.address,
              parseEther("10000")
            );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await expect(
            contracts.hysiBatchInteraction.connect(owner).batchMint(0)
          ).to.be.revertedWith("can not execute batch action yet");
        });
        it("reverts when called by someone other the keeper", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.hysiBatchInteraction.address,
              parseEther("10000")
            );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await provider.send("evm_increaseTime", [1800]);

          await expect(
            contracts.hysiBatchInteraction.connect(depositor).batchMint(0)
          ).to.be.revertedWith("you dont have the right role");
        });
      });
      context("success", function () {
        it("batch mints", async function () {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();

          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.hysiBatchInteraction.address,
              parseEther("10000")
            );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await provider.send("evm_increaseTime", [1800]);
          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchMint(0);
          expect(result)
            .to.emit(contracts.hysiBatchInteraction, "BatchMinted")
            .withArgs(batchId, parseEther("10000"), parseEther("50"));
          expect(
            await contracts.mockSetToken.balanceOf(
              contracts.hysiBatchInteraction.address
            )
          ).to.equal(parseEther("50"));
        });
        it("mints early when mintThreshold is met", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.hysiBatchInteraction.address,
              parseEther("10000")
            );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await contracts.mock3Crv
            .connect(depositor1)
            .approve(
              contracts.hysiBatchInteraction.address,
              parseEther("10000")
            );
          await contracts.hysiBatchInteraction
            .connect(depositor1)
            .depositForMint(parseEther("10000"), depositor1.address);
          await expect(
            contracts.hysiBatchInteraction.connect(owner).batchMint(0)
          ).to.emit(contracts.hysiBatchInteraction, "BatchMinted");
        });
        it("advances to the next batch", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.hysiBatchInteraction.address,
              parseEther("10000")
            );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await provider.send("evm_increaseTime", [1800]);

          const previousMintBatchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          await contracts.hysiBatchInteraction.batchMint(0);

          const previousBatch = await contracts.hysiBatchInteraction.batches(
            previousMintBatchId
          );
          expect(previousBatch.claimable).to.equal(true);

          const currentMintBatchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          expect(currentMintBatchId).to.not.equal(previousMintBatchId);
        });
      });
    });
    context("claiming", function () {
      beforeEach(async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        await contracts.mock3Crv
          .connect(depositor1)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor1)
          .depositForMint(parseEther("10000"), depositor1.address);
        await contracts.mock3Crv
          .connect(depositor2)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForMint(parseEther("10000"), depositor2.address);
        await contracts.mock3Crv
          .connect(depositor3)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor3)
          .depositForMint(parseEther("10000"), depositor3.address);
      });
      it("reverts when batch is not yet claimable", async function () {
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address)
        ).to.be.revertedWith("not yet claimable");
      });
      it("claims batch successfully", async function () {
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address)
        )
          .to.emit(contracts.hysiBatchInteraction, "Claimed")
          .withArgs(
            depositor.address,
            BatchType.Mint,
            parseEther("10000"),
            parseEther("50")
          );
        expect(
          await contracts.mockSetToken.balanceOf(depositor.address)
        ).to.equal(parseEther("50"));
        const batch = await contracts.hysiBatchInteraction.batches(batchId);
        expect(batch.unclaimedShares).to.equal(parseEther("30000"));
        expect(batch.claimableTokenBalance).to.equal(parseEther("150"));
      });
    });
  });

  describe("redeeming", function () {
    beforeEach(async function () {
      await contracts.mockSetToken.mint(depositor.address, parseEther("100"));
      await contracts.mockSetToken.mint(depositor1.address, parseEther("100"));
      await contracts.mockSetToken.mint(depositor2.address, parseEther("100"));
      await contracts.mockSetToken.mint(depositor3.address, parseEther("100"));
      await contracts.mockYearnVaultUSDX.mint(
        contracts.mockBasicIssuanceModule.address,
        parseEther("20000")
      );
      await contracts.mockYearnVaultUST.mint(
        contracts.mockBasicIssuanceModule.address,
        parseEther("20000")
      );
      await contracts.mockSetToken
        .connect(depositor)
        .increaseAllowance(
          contracts.hysiBatchInteraction.address,
          parseEther("10000000000")
        );
    });
    context("depositing", function () {
      describe("batch struct", () => {
        const deposit = async (amount?: number) => {
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(parseEther(amount ? amount.toString() : "10"));
        };

        const subject = async (batchId) => {
          const adapter = new HysiBatchInteractionAdapter(
            contracts.hysiBatchInteraction
          );
          const batch = await adapter.getBatch(batchId);
          return batch;
        };

        it("increments suppliedTokenBalance and unclaimedShares when a redeem deposit is made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          await deposit(10);
          const batch = await subject(batchId);
          expect(batch).to.deep.contain({
            suppliedTokenBalance: parseEther("10"),
            claimable: false,
            unclaimedShares: parseEther("10"),
          });
        });
        it("increments suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          await deposit(); // 10
          await deposit(); // 10
          await deposit(); // 10
          expect(await subject(batchId)).to.deep.contain({
            claimableTokenBalance: parseEther("0"),
            suppliedTokenBalance: parseEther("30"),
            claimable: false,
            unclaimedShares: parseEther("30"),
          });
        });
        it("updates struct when batch is minted", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to redeem batch
          await contracts.hysiBatchInteraction.batchRedeem(0);

          expect(await subject(batchId)).to.deep.contain({
            suppliedTokenBalance: parseEther("10"),
            claimable: true,
            unclaimedShares: parseEther("10"),
          });
        });
        it("decrements unclaimedShares and claimable when claim is made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to redeem batch
          await contracts.hysiBatchInteraction.batchRedeem(0);
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address);

          expect(await subject(batchId)).to.deep.contain({
            claimable: true,
            unclaimedShares: parseEther("0"),
            claimableTokenBalance: parseEther("0"),
          });
        });
      });
      it("deposits setToken in the current redeemBatch", async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        const result = await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        expect(result)
          .to.emit(contracts.hysiBatchInteraction, "Deposit")
          .withArgs(depositor.address, parseEther("100"));
        expect(
          await contracts.mockSetToken.balanceOf(
            contracts.hysiBatchInteraction.address
          )
        ).to.equal(parseEther("100"));
        const currentRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("100"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("100"));
      });
      it("adds the redeemBatch to the users batches", async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(parseEther("100"));

        const currentRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
      });
      it("allows multiple deposits", async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor1)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor1)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor2)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForRedeem(parseEther("50"));
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForRedeem(parseEther("50"));
        const currentRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("300"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("300"));
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor1.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor2.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
      });
    });
    context("batch redeeming", function () {
      beforeEach(async function () {
        await contracts.mockSetToken.mint(depositor.address, parseEther("100"));
        await contracts.mockSetToken.mint(
          depositor1.address,
          parseEther("100")
        );
        await contracts.mockSetToken.mint(
          depositor2.address,
          parseEther("100")
        );
        await contracts.mockSetToken.mint(
          depositor3.address,
          parseEther("100")
        );
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("20000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("20000")
        );
      });

      context("reverts", function () {
        it("reverts when redeeming too early", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await expect(
            contracts.hysiBatchInteraction.connect(owner).batchRedeem(0)
          ).to.be.revertedWith("can not execute batch action yet");
        });
        it("reverts when called by someone other the keeper", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await provider.send("evm_increaseTime", [1800]);

          await expect(
            contracts.hysiBatchInteraction.connect(depositor).batchRedeem(0)
          ).to.be.revertedWith("you dont have the right role");
        });
      });
      context("success", function () {
        it("batch redeems", async function () {
          const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();

          await contracts.mockSetToken
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await provider.send("evm_increaseTime", [1800]);

          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchRedeem(0);
          expect(result)
            .to.emit(contracts.hysiBatchInteraction, "BatchRedeemed")
            .withArgs(batchId, parseEther("100"), parseEther("9990"));
          expect(
            await contracts.mock3Crv.balanceOf(
              contracts.hysiBatchInteraction.address
            )
          ).to.equal(parseEther("9990"));
        });
        it("mints early when redeemThreshold is met", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await contracts.mockSetToken
            .connect(depositor1)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor1)
            .depositForRedeem(parseEther("100"));
          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchRedeem(0);
          expect(result).to.emit(
            contracts.hysiBatchInteraction,
            "BatchRedeemed"
          );
        });
        it("advances to the next batch", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await provider.send("evm_increaseTime", [1800]);

          const previousRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          await contracts.hysiBatchInteraction.batchRedeem(0);

          const previousBatch = await contracts.hysiBatchInteraction.batches(
            previousRedeemBatchId
          );
          expect(previousBatch.claimable).to.equal(true);

          const currentRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          expect(currentRedeemBatchId).to.not.equal(previousRedeemBatchId);
        });
      });
    });
    context("claiming", function () {
      beforeEach(async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor1)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor1)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor2)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor3)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor3)
          .depositForRedeem(parseEther("100"));
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("20000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("20000")
        );
      });
      it("reverts when batch is not yet claimable", async function () {
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.hysiBatchInteraction.claim(batchId, depositor.address)
        ).to.be.revertedWith("not yet claimable");
      });
      it("claim batch successfully", async function () {
        await provider.send("evm_increaseTime", [1800]);
        await contracts.hysiBatchInteraction.connect(owner).batchRedeem(0);
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address)
        )
          .to.emit(contracts.hysiBatchInteraction, "Claimed")
          .withArgs(
            depositor.address,
            BatchType.Redeem,
            parseEther("100"),
            parseEther("9990")
          );
        expect(await contracts.mock3Crv.balanceOf(depositor.address)).to.equal(
          parseEther("109990")
        );
        const batch = await contracts.hysiBatchInteraction.batches(batchId);
        expect(batch.unclaimedShares).to.equal(parseEther("300"));
      });
    });
  });
  context("withdrawing from batch", function () {
    describe("batch struct", () => {
      const withdraw = async (batchId: string, amount?: BigNumber) => {
        return contracts.hysiBatchInteraction
          .connect(depositor)
          .withdrawFromBatch(
            batchId,
            amount ? amount : parseEther("10"),
            depositor.address
          );
      };
      const subject = async (batchId) => {
        const adapter = new HysiBatchInteractionAdapter(
          contracts.hysiBatchInteraction
        );
        const batch = await adapter.getBatch(batchId);
        return batch;
      };
      context("redeem batch withdrawal", () => {
        beforeEach(async function () {
          await contracts.mockSetToken.mint(
            depositor.address,
            parseEther("100")
          );
          await contracts.mockSetToken.mint(
            depositor1.address,
            parseEther("100")
          );
          await contracts.mockSetToken.mint(
            depositor2.address,
            parseEther("100")
          );
          await contracts.mockSetToken.mint(
            depositor3.address,
            parseEther("100")
          );
          await contracts.mockYearnVaultUSDX.mint(
            contracts.mockBasicIssuanceModule.address,
            parseEther("20000")
          );
          await contracts.mockYearnVaultUST.mint(
            contracts.mockBasicIssuanceModule.address,
            parseEther("20000")
          );
          await contracts.mockSetToken
            .connect(depositor)
            .increaseAllowance(
              contracts.hysiBatchInteraction.address,
              parseEther("10000000000")
            );
          await contracts.mockSetToken
            .connect(owner)
            .mint(depositor.address, parseEther("100"));
          await contracts.mockSetToken
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await contracts.mockCrvUSDX.mint(
            contracts.mockYearnVaultUSDX.address,
            parseEther("20000")
          );
          await contracts.mockCrvUST.mint(
            contracts.mockYearnVaultUST.address,
            parseEther("20000")
          );
        });

        it("decrements suppliedTokenBalance and unclaimedShares when a withdrawal is made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId);
          const batchAfter = await subject(batchId);
          expect(
            batchAfter.suppliedTokenBalance.lt(batchBefore.suppliedTokenBalance)
          ).to.be.true;
          expect(batchAfter.unclaimedShares.lt(batchBefore.unclaimedShares)).to
            .be.true;
        });
        it("decrements suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          const batchAfter = await subject(batchId);
          expect(
            batchBefore.suppliedTokenBalance.sub(parseEther("30"))
          ).to.equal(batchAfter.suppliedTokenBalance);
          expect(batchBefore.unclaimedShares.sub(parseEther("30"))).to.equal(
            batchAfter.unclaimedShares
          );
        });
        it("transfers set token to depositor after withdraw", async function () {
          const batchId = await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .withdrawFromBatch(batchId, parseEther("100"), depositor.address);
          expect(
            await contracts.mockSetToken.balanceOf(depositor.address)
          ).to.equal(parseEther("200"));
        });
        it("reverts when the batch was already redeemed", async function () {
          const batchId = await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          );
          await timeTravel(1 * DAY);
          await contracts.hysiBatchInteraction.batchRedeem(0);
          await expect(withdraw(batchId)).to.be.revertedWith(
            "already processed"
          );
        });
      });
      context("mint batch withdrawal", () => {
        beforeEach(async function () {
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("100"), depositor.address);
        });
        it("decrements suppliedTokenBalance and unclaimedShares when a withdrawal is made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId, parseEther("10"));
          const batchAfter = await subject(batchId);
          expect(
            batchAfter.suppliedTokenBalance.lt(batchBefore.suppliedTokenBalance)
          ).to.be.true;
          expect(batchAfter.unclaimedShares.lt(batchBefore.unclaimedShares)).to
            .be.true;
        });
        it("decrements suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          const batchAfter = await subject(batchId);
          expect(
            batchBefore.suppliedTokenBalance.sub(parseEther("30"))
          ).to.equal(batchAfter.suppliedTokenBalance);
          expect(batchBefore.unclaimedShares.sub(parseEther("30"))).to.equal(
            batchAfter.unclaimedShares
          );
        });
        it("emits an event when withdrawn", async function () {
          const batchId = await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          );
          expect(await withdraw(batchId, parseEther("100")))
            .to.emit(contracts.hysiBatchInteraction, "WithdrawnFromBatch")
            .withArgs(batchId, parseEther("100"), depositor.address);
        });
        it("transfers 3crv to depositor after withdraw", async function () {
          const batchId = await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          );
          const balanceBefore = await contracts.mock3Crv.balanceOf(
            depositor.address
          );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .withdrawFromBatch(batchId, parseEther("100"), depositor.address);
          const balanceAfter = await contracts.mock3Crv.balanceOf(
            depositor.address
          );
          expect(balanceAfter.sub(balanceBefore)).to.equal(parseEther("100"));
        });
        it("reverts when the batch was already minted", async function () {
          const batchId = await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          );
          await timeTravel(1 * DAY);
          await contracts.hysiBatchInteraction.batchMint(0);
          await expect(withdraw(batchId)).to.be.revertedWith(
            "already processed"
          );
        });
      });
    });
  });
  context("moveUnclaimedDepositsIntoCurrentBatch", function () {
    context("error", function () {
      it("reverts when length of batchIds and shares are not matching", async function () {
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              new Array(2).fill(
                "0xa15f699e141c27ed0edace41ff8fa7b836e3ddb658b25c811a1674e9c7a75c5c"
              ),
              new Array(3).fill(parseEther("10")),
              BatchType.Mint
            )
        ).to.be.revertedWith("array lengths must match");
      });
      it("reverts if given a batch that is not from the correct batchType", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);

        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.hysiBatchInteraction.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId],
            [parseEther("10000")],
            BatchType.Redeem
          )
        ).to.be.revertedWith("incorrect batchType");
      });
      it("reverts on an unclaimable batch", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.hysiBatchInteraction.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId],
            [parseEther("10000")],
            BatchType.Mint
          )
        ).to.be.revertedWith("has not yet been processed");
      });
      it("reverts if the user has insufficient funds", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.batchMint(0);
        await expect(
          contracts.hysiBatchInteraction.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId],
            [parseEther("20000")],
            BatchType.Mint
          )
        ).to.be.revertedWith("account has insufficient funds");
      });
    });
    context("success", function () {
      it("moves hysi into current redeemBatch", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
        const mintedHYSI = await contracts.mockSetToken.balanceOf(
          contracts.hysiBatchInteraction.address
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId],
              [parseEther("10000")],
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI, BatchType.Mint, depositor.address);
        const currentRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI);
      });
      it("moves 3crv into current mintBatch", async function () {
        await contracts.mockSetToken.mint(depositor.address, parseEther("100"));
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("20000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("20000")
        );
        await contracts.mockYearnVaultUSDX.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("20000")
        );
        await contracts.mockYearnVaultUST.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("20000")
        );
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchRedeem(0);
        const redeemed3CRV = await contracts.mock3Crv.balanceOf(
          contracts.hysiBatchInteraction.address
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId],
              [parseEther("100")],
              BatchType.Redeem
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(redeemed3CRV, BatchType.Redeem, depositor.address);
        const currentMintBatchId = await contracts.hysiBatchInteraction.currentMintBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentMintBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(redeemed3CRV);
      });
      it("moves only parts of the funds in a batch", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.hysiBatchInteraction.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
        const mintedHYSI = await contracts.mockSetToken.balanceOf(
          contracts.hysiBatchInteraction.address
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId],
              [parseEther("5000")],
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI.div(2), BatchType.Mint, depositor.address);
        const currentRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI.div(2));
        const mintBatch = await contracts.hysiBatchInteraction.batches(batchId);
        expect(mintBatch.claimableTokenBalance).to.be.equal(mintedHYSI.div(2));
      });
      it("moves funds from up to 20 batches", async function () {
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("100000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("100000")
        );
        await contracts.mockYearnVaultUSDX.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("100000")
        );
        await contracts.mockYearnVaultUST.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("100000")
        );

        await contracts.mock3Crv.mint(depositor.address, parseEther("2000"));
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("2000"));
        await bluebird.map(
          new Array(20).fill(0),
          async (i) => {
            await contracts.hysiBatchInteraction
              .connect(depositor)
              .depositForMint(parseEther("100"), depositor.address);
            await provider.send("evm_increaseTime", [1800]);
            await provider.send("evm_mine", []);
            await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
          },
          { concurrency: 1 }
        );
        const batchIds = await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
        const mintedHYSI = await contracts.mockSetToken.balanceOf(
          contracts.hysiBatchInteraction.address
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              batchIds,
              new Array(20).fill(parseEther("100")),
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI, BatchType.Mint, depositor.address);
        const currentRedeemBatchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI);
      });
    });
  });
});
