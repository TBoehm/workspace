import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import bluebird from "bluebird";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, waffle } from "hardhat";
import { ACLRegistry, MockERC20, Staking } from "../typechain";
import { RewardsEscrow } from "../typechain/RewardsEscrow";

interface Contracts {
  mockPop: MockERC20;
  staking: Staking;
  aclRegistry: ACLRegistry;
  rewardsEscrow: RewardsEscrow;
}

let owner: SignerWithAddress,
  rewarder: SignerWithAddress,
  nonOwner: SignerWithAddress;

let contracts: Contracts;
let popBalance: BigNumber;
const stakingFund = parseEther("10");
const dayInSec = 86400;

async function deployContracts(): Promise<Contracts> {
  const mockPop = (await (
    await (
      await ethers.getContractFactory("MockERC20")
    ).deploy("TestPOP", "TPOP", 18)
  ).deployed()) as MockERC20;
  await mockPop.mint(owner.address, parseEther("500"));
  await mockPop.mint(nonOwner.address, parseEther("10"));

  const aclRegistry = await (
    await (await ethers.getContractFactory("ACLRegistry")).deploy()
  ).deployed();

  const contractRegistry = await (
    await (
      await ethers.getContractFactory("ContractRegistry")
    ).deploy(aclRegistry.address)
  ).deployed();

  const rewardsEscrow = (await (
    await (
      await ethers.getContractFactory("RewardsEscrow")
    ).deploy(contractRegistry.address)
  ).deployed()) as RewardsEscrow;

  const staking = (await (
    await (
      await ethers.getContractFactory("Staking")
    ).deploy(contractRegistry.address)
  ).deployed()) as Staking;

  await aclRegistry
    .connect(owner)
    .grantRole(ethers.utils.id("DAO"), owner.address);

  await contractRegistry
    .connect(owner)
    .addContract(ethers.utils.id("POP"), mockPop.address, ethers.utils.id("1"));
  await contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("Staking"),
      staking.address,
      ethers.utils.id("1")
    );
  await contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("RewardsEscrow"),
      rewardsEscrow.address,
      ethers.utils.id("1")
    );

  await mockPop.transfer(staking.address, stakingFund);
  await mockPop.connect(owner).approve(staking.address, parseEther("100000"));

  await staking.notifyRewardAmount(stakingFund);
  await staking.connect(owner).stake(parseEther("1"), 604800);

  return { mockPop, staking, aclRegistry, rewardsEscrow };
}

describe("RewardsEscrow", function () {
  beforeEach(async function () {
    [owner, rewarder, nonOwner] = await ethers.getSigners();
    contracts = await deployContracts();
  });

  describe("restricted functions", function () {
    it("should revert updateEscrowDuration if not owner", async function () {
      await expect(
        contracts.rewardsEscrow
          .connect(nonOwner)
          .updateEscrowDuration(nonOwner.address)
      ).to.be.revertedWith("you dont have the right role");
    });

    it("update escrow duration", async function () {
      await contracts.rewardsEscrow.connect(owner).updateEscrowDuration(604800);
      expect(await contracts.rewardsEscrow.escrowDuration()).to.equal(604800);
    });
  });

  describe("lock", function () {
    beforeEach(async function () {
      ethers.provider.send("evm_increaseTime", [302400]);
      ethers.provider.send("evm_mine", []);
    });
    it("should not allow anyone but the staking contract to lock funds", async function () {
      await expect(
        contracts.rewardsEscrow
          .connect(owner)
          .lock(owner.address, parseEther("1"))
      ).to.be.revertedWith("you cant call this function");
    });
    it("should transfer funds, lock them and emit an event", async function () {
      const currentBlockNumber = await ethers.provider.getBlockNumber();
      const currentBlock = await ethers.provider._getBlock(currentBlockNumber);
      const result = await contracts.staking.connect(owner).getReward();
      const lockedAmount = parseEther("3.333344356260915194");
      const escrowId = await contracts.rewardsEscrow.getEscrowsByUser(
        owner.address
      );
      const escrow = await contracts.rewardsEscrow.escrows(escrowId[0]);
      expect(result)
        .to.emit(contracts.rewardsEscrow, "Locked")
        .withArgs(owner.address, lockedAmount);
      expect(escrow.balance).to.equal(lockedAmount);
      expect(
        await contracts.mockPop.balanceOf(contracts.rewardsEscrow.address)
      ).to.equal(lockedAmount);
      expect(
        escrow.start > BigNumber.from(currentBlock.timestamp + 90 * dayInSec)
      ).to.equal(true);
      expect(escrow.end).to.equal(escrow.start.add(90 * dayInSec));
    });
    it("should add another escrow vault when locking again", async function () {
      await contracts.staking.connect(owner).getReward();
      ethers.provider.send("evm_increaseTime", [302400]);
      ethers.provider.send("evm_mine", []);
      await contracts.staking.connect(owner).getReward();
      const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
        owner.address
      );

      expect(escrowIds.length).to.equal(2);

      const escrow1 = await contracts.rewardsEscrow.escrows(escrowIds[0]);
      const escrow2 = await contracts.rewardsEscrow.escrows(escrowIds[1]);
      expect(escrow1.balance).to.be.equal(parseEther("3.333344356260915194"));
      expect(escrow2.balance).to.be.equal(parseEther("3.333311287477846412"));
    });
  });

  describe("claim vested rewards", function () {
    context("claim single escrow", function () {
      beforeEach(async function () {
        ethers.provider.send("evm_increaseTime", [304800]);
        ethers.provider.send("evm_mine", []);
        await contracts.staking.connect(owner).getReward();
      });
      it("reverts if there are no rewards to claim", async function () {
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        await expect(
          contracts.rewardsEscrow.connect(owner).claimReward(escrowIds[0])
        ).to.be.revertedWith("no rewards");
      });
      it("claims full rewards successfully after vesting period", async function () {
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        const escrow = await contracts.rewardsEscrow.escrows(escrowIds[0]);
        ethers.provider.send("evm_increaseTime", [181 * dayInSec]);
        ethers.provider.send("evm_mine", []);
        const oldBalance = await contracts.mockPop.balanceOf(owner.address);

        await expect(
          contracts.rewardsEscrow.connect(owner).claimReward(escrowIds[0])
        )
          .to.emit(contracts.rewardsEscrow, "RewardsClaimed")
          .withArgs(owner.address, escrow.balance);

        const newBalance = await contracts.mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance.add(escrow.balance));
      });
      it("claims partial rewards successfully during the vesting period", async function () {
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        const escrow = await contracts.rewardsEscrow.escrows(escrowIds[0]);

        ethers.provider.send("evm_increaseTime", [91 * dayInSec]);
        ethers.provider.send("evm_mine", []);

        const oldBalance = await contracts.mockPop.balanceOf(owner.address);
        const currentBlock = await waffle.provider.getBlock("latest");
        const result = await contracts.rewardsEscrow
          .connect(owner)
          .claimReward(escrowIds[0]);

        const expectedReward = escrow.balance
          .mul(
            BigNumber.from(String(currentBlock.timestamp + 1)).sub(escrow.start)
          )
          .div(escrow.end.sub(escrow.start));

        expect(result)
          .to.emit(contracts.rewardsEscrow, "RewardsClaimed")
          .withArgs(owner.address, expectedReward);

        const newBalance = await contracts.mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance.add(expectedReward));

        //Check if the escrowId got deleted
        expect(
          (await contracts.rewardsEscrow.getEscrowsByUser(owner.address)).length
        ).to.equal(1);
      });
      it("should still claim when a lot of escrows got added", async function () {
        await bluebird.map(
          new Array(50).fill(0),
          async (x, i) => {
            await contracts.staking.connect(owner).getReward();
          },
          { concurrency: 1 }
        );
        ethers.provider.send("evm_increaseTime", [181 * dayInSec]);
        ethers.provider.send("evm_mine", []);
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );

        const escrow = await contracts.rewardsEscrow.escrows(escrowIds[0]);
        const oldBalance = await contracts.mockPop.balanceOf(owner.address);

        await expect(
          contracts.rewardsEscrow.connect(owner).claimReward(escrowIds[0])
        )
          .to.emit(contracts.rewardsEscrow, "RewardsClaimed")
          .withArgs(owner.address, escrow.balance);

        const newBalance = await contracts.mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance.add(escrow.balance));
      });
    });
    context("claim multiple escrows", function () {
      beforeEach(async function () {
        ethers.provider.send("evm_increaseTime", [304800]);
        ethers.provider.send("evm_mine", []);
        await contracts.staking.connect(owner).getReward();
      });
      it("reverts if there are no rewards to claim", async function () {
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        await expect(
          contracts.rewardsEscrow.connect(owner).claimRewards([escrowIds[0]])
        ).to.be.revertedWith("no rewards");
      });
      it("reverts when trying to claim to many escrows", async function () {
        await bluebird.map(
          new Array(30).fill(0),
          async (x, i) => {
            await contracts.staking.connect(owner).getReward();
          },
          { concurrency: 1 }
        );
        ethers.provider.send("evm_increaseTime", [181 * dayInSec]);
        ethers.provider.send("evm_mine", []);
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        await expect(
          contracts.rewardsEscrow
            .connect(owner)
            .claimRewards(escrowIds.slice(0, 21))
        ).to.be.revertedWith("claiming too many escrows");
      });
      it("claims full rewards successfully after vesting period", async function () {
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        const escrow = await contracts.rewardsEscrow.escrows(escrowIds[0]);
        ethers.provider.send("evm_increaseTime", [181 * dayInSec]);
        ethers.provider.send("evm_mine", []);
        const oldBalance = await contracts.mockPop.balanceOf(owner.address);

        await expect(
          contracts.rewardsEscrow.connect(owner).claimRewards([escrowIds[0]])
        )
          .to.emit(contracts.rewardsEscrow, "RewardsClaimed")
          .withArgs(owner.address, escrow.balance);

        const newBalance = await contracts.mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance.add(escrow.balance));
      });
      it("claims partial rewards successfully during the vesting period", async function () {
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        const escrow = await contracts.rewardsEscrow.escrows(escrowIds[0]);

        ethers.provider.send("evm_increaseTime", [91 * dayInSec]);
        ethers.provider.send("evm_mine", []);

        const oldBalance = await contracts.mockPop.balanceOf(owner.address);
        const currentBlock = await waffle.provider.getBlock("latest");
        const result = await contracts.rewardsEscrow
          .connect(owner)
          .claimRewards([escrowIds[0]]);

        const expectedReward = escrow.balance
          .mul(
            BigNumber.from(String(currentBlock.timestamp + 1)).sub(escrow.start)
          )
          .div(escrow.end.sub(escrow.start));

        expect(result)
          .to.emit(contracts.rewardsEscrow, "RewardsClaimed")
          .withArgs(owner.address, expectedReward);

        const newBalance = await contracts.mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance.add(expectedReward));
      });
      it("should still claim when a lot of escrows got added", async function () {
        await bluebird.map(
          new Array(50).fill(0),
          async (x, i) => {
            await contracts.staking.connect(owner).getReward();
          },
          { concurrency: 1 }
        );
        ethers.provider.send("evm_increaseTime", [181 * dayInSec]);
        ethers.provider.send("evm_mine", []);
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        const escrow = await contracts.rewardsEscrow.escrows(escrowIds[0]);
        const oldBalance = await contracts.mockPop.balanceOf(owner.address);

        await expect(
          contracts.rewardsEscrow.connect(owner).claimReward(escrowIds[0])
        )
          .to.emit(contracts.rewardsEscrow, "RewardsClaimed")
          .withArgs(owner.address, escrow.balance);

        const newBalance = await contracts.mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance.add(escrow.balance));
      });
      it("should allow to claim one escrow balance fully while claiming another one partially", async function () {
        ethers.provider.send("evm_increaseTime", [1 * dayInSec]);
        ethers.provider.send("evm_mine", []);
        await contracts.staking.connect(owner).getReward();
        const escrowIds = await contracts.rewardsEscrow.getEscrowsByUser(
          owner.address
        );
        const escrow1 = await contracts.rewardsEscrow.escrows(escrowIds[0]);
        const escrow2 = await contracts.rewardsEscrow.escrows(escrowIds[1]);
        const timestamp = (await waffle.provider.getBlock("latest")).timestamp;
        ethers.provider.send("evm_increaseTime", [
          escrow1.end.toNumber() - timestamp,
        ]);
        ethers.provider.send("evm_mine", []);
        const oldBalance = await contracts.mockPop.balanceOf(owner.address);
        const currentBlock = await waffle.provider.getBlock("latest");
        const result = await contracts.rewardsEscrow
          .connect(owner)
          .claimRewards([escrowIds[0], escrowIds[1]]);

        expect(
          await (
            await contracts.rewardsEscrow.escrows(escrowIds[0])
          ).claimed
        ).to.be.equal(true);
        expect(
          await (
            await contracts.rewardsEscrow.escrows(escrowIds[1])
          ).claimed
        ).to.be.equal(false);

        const escrow2ExpectedReward = escrow2.balance
          .mul(
            BigNumber.from(String(currentBlock.timestamp + 1)).sub(
              escrow2.start
            )
          )
          .div(escrow2.end.sub(escrow2.start));
        const expectedReward = escrow2ExpectedReward.add(escrow1.balance);

        expect(result)
          .to.emit(contracts.rewardsEscrow, "RewardsClaimed")
          .withArgs(owner.address, expectedReward);

        const newBalance = await contracts.mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance.add(expectedReward));
      });
    });
  });
});
