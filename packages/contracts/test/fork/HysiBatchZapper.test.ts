import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import BasicIssuanceModuleAbi from "@setprotocol/set-protocol-v2/artifacts/contracts/protocol/modules/BasicIssuanceModule.sol/BasicIssuanceModule.json";
import SetTokenAbi from "@setprotocol/set-protocol-v2/artifacts/contracts/protocol/SetToken.sol/SetToken.json";
import {
  BasicIssuanceModule,
  SetToken,
} from "@setprotocol/set-protocol-v2/dist/typechain";
import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, network, waffle } from "hardhat";
import HysiBatchInteractionAdapter, {
  ComponentMap,
} from "../../adapters/HYSIBatchInteraction/HYSIBatchInteractionAdapter";
import CurveMetapoolAbi from "../../lib/Curve/CurveMetapoolAbi.json";
import {
  ACLRegistry,
  ContractRegistry,
  Curve3Pool,
  CurveMetapool,
  ERC20,
  Faucet,
  HysiBatchInteraction,
  HysiBatchZapper,
  KeeperIncentive,
  MockYearnV2Vault,
  Staking,
} from "../../typechain";

const provider = waffle.provider;

interface Contracts {
  pop: ERC20;
  dai: ERC20;
  usdc: ERC20;
  usdt: ERC20;
  threeCrv: ERC20;
  crvDUSD: ERC20;
  crvFRAX: ERC20;
  crvUSDN: ERC20;
  crvUST: ERC20;
  threePool: Curve3Pool;
  dusdMetapool: CurveMetapool;
  fraxMetapool: CurveMetapool;
  usdnMetapool: CurveMetapool;
  ustMetapool: CurveMetapool;
  yDUSD: MockYearnV2Vault;
  yFRAX: MockYearnV2Vault;
  yUSDN: MockYearnV2Vault;
  yUST: MockYearnV2Vault;
  hysi: SetToken;
  setToken: SetToken; // alias for hysi
  basicIssuanceModule: BasicIssuanceModule;
  hysiBatchInteraction: HysiBatchInteraction;
  staking: Staking;
  keeperIncentive: KeeperIncentive;
  faucet: Faucet;
  aclRegistry: ACLRegistry;
  contractRegistry: ContractRegistry;
  hysiBatchZapper: HysiBatchZapper;
}

enum BatchType {
  Mint,
  Redeem,
}

let owner: SignerWithAddress, depositor: SignerWithAddress;
let contracts: Contracts;
let DepositorInitial: BigNumber;
let HysiBalance: BigNumber;

const HYSI_TOKEN_ADDRESS = "0x8d1621a27bb8c84e59ca339cf9b21e15b907e408";

const SET_BASIC_ISSUANCE_MODULE_ADDRESS =
  "0xd8EF3cACe8b4907117a45B0b125c68560532F94D";

const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";

const THREE_CRV_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";

const THREEPOOL_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const CRV_DUSD_TOKEN_ADDRESS = "0x3a664ab939fd8482048609f652f9a0b0677337b9";
const CRV_FRAX_TOKEN_ADDRESS = "0xd632f22692fac7611d2aa1c0d552930d43caed3b";
const CRV_USDN_TOKEN_ADDRESS = "0x4f3e8f405cf5afc05d68142f3783bdfe13811522";
const CRV_UST_TOKEN_ADDRESS = "0x94e131324b6054c0D789b190b2dAC504e4361b53";

const DUSD_METAPOOL_ADDRESS = "0x8038C01A0390a8c547446a0b2c18fc9aEFEcc10c";
const FRAX_METAPOOL_ADDRESS = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
const USDN_METAPOOL_ADDRESS = "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1";
const UST_METAPOOL_ADDRESS = "0x890f4e345B1dAED0367A877a1612f86A1f86985f";

const YDUSD_TOKEN_ADDRESS = "0x30fcf7c6cdfc46ec237783d94fc78553e79d4e9c";
const YFRAX_TOKEN_ADDRESS = "0xb4ada607b9d6b2c9ee07a275e9616b84ac560139";
const YUSDN_TOKEN_ADDRESS = "0x3b96d491f067912d18563d56858ba7d6ec67a6fa";
const YUST_TOKEN_ADDRESS = "0x1c6a9783f812b3af3abbf7de64c3cd7cc7d1af44";

const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const CURVE_ADDRESS_PROVIDER_ADDRESS =
  "0x0000000022D53366457F9d5E68Ec105046FC4383";
const CURVE_FACTORY_METAPOOL_DEPOSIT_ZAP_ADDRESS =
  "0xA79828DF1850E8a3A3064576f380D90aECDD3359";

const componentMap: ComponentMap = {
  [YDUSD_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
  [YFRAX_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
  [YUSDN_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
  [YUST_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
};

async function deployContracts(): Promise<Contracts> {
  //Deploy helper Faucet
  const Faucet = await ethers.getContractFactory("Faucet");
  const faucet = await (
    await Faucet.deploy(
      UNISWAP_ROUTER_ADDRESS,
      CURVE_ADDRESS_PROVIDER_ADDRESS,
      CURVE_FACTORY_METAPOOL_DEPOSIT_ZAP_ADDRESS
    )
  ).deployed();

  const pop = await (
    await (
      await ethers.getContractFactory("MockERC20")
    ).deploy("POP", "POP", 18)
  ).deployed();
  const dai = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    DAI_ADDRESS
  )) as ERC20;

  const usdc = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    USDC_ADDRESS
  )) as ERC20;

  const usdt = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    USDT_ADDRESS
  )) as ERC20;

  //Deploy Curve Token
  const threeCrv = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    THREE_CRV_TOKEN_ADDRESS
  )) as ERC20;

  const crvDUSD = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_DUSD_TOKEN_ADDRESS
  )) as ERC20;

  const crvFRAX = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_FRAX_TOKEN_ADDRESS
  )) as ERC20;

  const crvUSDN = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_USDN_TOKEN_ADDRESS
  )) as ERC20;

  const crvUST = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_UST_TOKEN_ADDRESS
  )) as ERC20;

  const threePool = (await ethers.getContractAt(
    "Curve3Pool",
    THREEPOOL_ADDRESS
  )) as Curve3Pool;

  //Deploy Curve Metapool
  const dusdMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    DUSD_METAPOOL_ADDRESS
  )) as CurveMetapool;

  const fraxMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    FRAX_METAPOOL_ADDRESS
  )) as CurveMetapool;

  const usdnMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    USDN_METAPOOL_ADDRESS
  )) as CurveMetapool;

  const ustMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    UST_METAPOOL_ADDRESS
  )) as CurveMetapool;

  //Deploy Yearn Vaults
  const yDUSD = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YDUSD_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  const yFRAX = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YFRAX_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  const yUSDN = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YUSDN_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  const yUST = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YUST_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  componentMap[YDUSD_TOKEN_ADDRESS].metaPool = dusdMetapool;
  componentMap[YDUSD_TOKEN_ADDRESS].yPool = yDUSD;
  componentMap[YFRAX_TOKEN_ADDRESS].metaPool = fraxMetapool;
  componentMap[YFRAX_TOKEN_ADDRESS].yPool = yFRAX;
  componentMap[YUSDN_TOKEN_ADDRESS].metaPool = usdnMetapool;
  componentMap[YUSDN_TOKEN_ADDRESS].yPool = yUSDN;
  componentMap[YUST_TOKEN_ADDRESS].metaPool = ustMetapool;
  componentMap[YUST_TOKEN_ADDRESS].yPool = yUST;

  //Deploy Set Procotol
  const hysi = (await ethers.getContractAt(
    SetTokenAbi.abi,
    HYSI_TOKEN_ADDRESS
  )) as unknown as SetToken;

  const basicIssuanceModule = (await ethers.getContractAt(
    BasicIssuanceModuleAbi.abi,
    SET_BASIC_ISSUANCE_MODULE_ADDRESS
  )) as unknown as BasicIssuanceModule;

  const aclRegistry = await (
    await (await ethers.getContractFactory("ACLRegistry")).deploy()
  ).deployed();

  const contractRegistry = await (
    await (
      await ethers.getContractFactory("ContractRegistry")
    ).deploy(aclRegistry.address)
  ).deployed();

  const keeperIncentive = await (
    await (
      await ethers.getContractFactory("KeeperIncentive")
    ).deploy(contractRegistry.address, 0, 0)
  ).deployed();

  const staking = await (
    await (
      await ethers.getContractFactory("Staking")
    ).deploy(contractRegistry.address)
  ).deployed();

  //Deploy HysiBatchInteraction
  const HysiBatchInteraction = await ethers.getContractFactory(
    "HysiBatchInteraction"
  );
  const hysiBatchInteraction = await (
    await HysiBatchInteraction.deploy(
      contractRegistry.address,
      HYSI_TOKEN_ADDRESS,
      THREE_CRV_TOKEN_ADDRESS,
      SET_BASIC_ISSUANCE_MODULE_ADDRESS,
      [
        YDUSD_TOKEN_ADDRESS,
        YFRAX_TOKEN_ADDRESS,
        YUSDN_TOKEN_ADDRESS,
        YUST_TOKEN_ADDRESS,
      ],
      [
        {
          curveMetaPool: DUSD_METAPOOL_ADDRESS,
          crvLPToken: CRV_DUSD_TOKEN_ADDRESS,
        },
        {
          curveMetaPool: FRAX_METAPOOL_ADDRESS,
          crvLPToken: CRV_FRAX_TOKEN_ADDRESS,
        },
        {
          curveMetaPool: USDN_METAPOOL_ADDRESS,
          crvLPToken: CRV_USDN_TOKEN_ADDRESS,
        },
        {
          curveMetaPool: UST_METAPOOL_ADDRESS,
          crvLPToken: CRV_UST_TOKEN_ADDRESS,
        },
      ],
      2500,
      parseEther("200"),
      parseEther("1")
    )
  ).deployed();

  const hysiBatchZapper = await (
    await (
      await ethers.getContractFactory("HysiBatchZapper")
    ).deploy(contractRegistry.address, threePool.address, threeCrv.address)
  ).deployed();

  return {
    pop,
    dai,
    usdc,
    usdt,
    threeCrv,
    crvDUSD,
    crvFRAX,
    crvUSDN,
    crvUST,
    threePool,
    dusdMetapool,
    fraxMetapool,
    usdnMetapool,
    ustMetapool,
    yDUSD,
    yFRAX,
    yUSDN,
    yUST,
    hysi,
    setToken: hysi,
    basicIssuanceModule,
    hysiBatchInteraction,
    staking,
    keeperIncentive,
    faucet,
    aclRegistry,
    contractRegistry,
    hysiBatchZapper,
  };
}

const deployAndAssignContracts = async () => {
  [owner, depositor] = await ethers.getSigners();
  contracts = await deployContracts();
  await network.provider.send("hardhat_setBalance", [
    contracts.faucet.address,
    "0x152d02c7e14af6800000", // 100k ETH
  ]);

  await contracts.aclRegistry.grantRole(ethers.utils.id("DAO"), owner.address);
  await contracts.aclRegistry.grantRole(ethers.utils.id("DAO"), owner.address);
  await contracts.aclRegistry.grantRole(
    ethers.utils.id("Keeper"),
    owner.address
  );
  await contracts.aclRegistry.grantRole(
    ethers.utils.id("HysiZapper"),
    contracts.hysiBatchZapper.address
  );

  await contracts.contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("POP"),
      contracts.pop.address,
      ethers.utils.id("1")
    );
  await contracts.contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("KeeperIncentive"),
      contracts.keeperIncentive.address,
      ethers.utils.id("1")
    );
  await contracts.contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("HysiBatchInteraction"),
      contracts.hysiBatchInteraction.address,
      ethers.utils.id("1")
    );
  await contracts.contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("Staking"),
      contracts.staking.address,
      ethers.utils.id("1")
    );

  await contracts.keeperIncentive
    .connect(owner)
    .createIncentive(
      utils.formatBytes32String("HysiBatchInteraction"),
      0,
      true,
      false
    );
  await contracts.keeperIncentive
    .connect(owner)
    .createIncentive(
      utils.formatBytes32String("HysiBatchInteraction"),
      0,
      true,
      false
    );
  await contracts.keeperIncentive
    .connect(owner)
    .addControllerContract(
      utils.formatBytes32String("HysiBatchInteraction"),
      contracts.hysiBatchInteraction.address
    );

  await contracts.faucet.sendTokens(
    contracts.dai.address,
    4,
    depositor.address
  );

  await contracts.faucet.sendTokens(
    contracts.usdc.address,
    4,
    depositor.address
  );

  await contracts.faucet.sendTokens(
    contracts.usdt.address,
    4,
    depositor.address
  );

  DepositorInitial = await contracts.dai.balanceOf(depositor.address);
  await contracts.faucet.sendThreeCrv(100, depositor.address);
  await contracts.dai
    .connect(depositor)
    .approve(contracts.hysiBatchZapper.address, parseEther("100000000"));
  await contracts.usdc
    .connect(depositor)
    .approve(contracts.hysiBatchZapper.address, parseEther("100000000"));
  await contracts.usdt
    .connect(depositor)
    .approve(contracts.hysiBatchZapper.address, parseEther("100000000"));
  await contracts.threeCrv
    .connect(depositor)
    .approve(contracts.hysiBatchInteraction.address, parseEther("100000000"));
  await contracts.hysi
    .connect(depositor)
    .approve(contracts.hysiBatchInteraction.address, parseEther("100000000"));
  await contracts.hysiBatchInteraction
    .connect(depositor)
    .depositForMint(DepositorInitial, depositor.address);
  const [batchId] = await contracts.hysiBatchInteraction.getAccountBatches(
    depositor.address
  );
  timeTravel(2500);
  await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
  await contracts.hysiBatchInteraction
    .connect(depositor)
    .claim(batchId, depositor.address);
  HysiBalance = await contracts.hysi.balanceOf(depositor.address);
};

const timeTravel = async (time: number) => {
  await provider.send("evm_increaseTime", [time]);
  await provider.send("evm_mine", []);
};

describe("HysiBatchZapper Network Test", function () {
  before(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.FORKING_RPC_URL,
            blockNumber: 13206601,
          },
        },
      ],
    });
  });
  beforeEach(async function () {
    await deployAndAssignContracts();
  });
  describe("zapIntoBatch", function () {
    it("zaps into a mint queue with dai", async function () {
      const result = await contracts.hysiBatchZapper
        .connect(depositor)
        .zapIntoBatch([DepositorInitial, 0, 0], 0);

      expect(result)
        .to.emit(contracts.hysiBatchZapper, "ZappedIntoBatch")
        .withArgs(parseEther("12852.524944794116252972"), depositor.address);

      expect(result)
        .to.emit(contracts.hysiBatchInteraction, "Deposit")
        .withArgs(depositor.address, parseEther("12852.524944794116252972"));

      expect(await contracts.dai.balanceOf(depositor.address)).to.equal(0);
    });
    it("zaps into mint queue with usdc", async function () {
      const result = await contracts.hysiBatchZapper
        .connect(depositor)
        .zapIntoBatch([0, BigNumber.from(1e6), 0], 0);
      expect(result)
        .to.emit(contracts.hysiBatchZapper, "ZappedIntoBatch")
        .withArgs(parseEther("0.981292392583226327"), depositor.address);

      expect(result)
        .to.emit(contracts.hysiBatchInteraction, "Deposit")
        .withArgs(depositor.address, parseEther("0.981292392583226327"));

      expect(await contracts.usdc.balanceOf(depositor.address)).to.equal(
        BigNumber.from("26230376808")
      );
    });
    it("zaps into mint queue with usdt", async function () {
      const result = await contracts.hysiBatchZapper
        .connect(depositor)
        .zapIntoBatch([0, 0, BigNumber.from(1e6)], 0);
      expect(result)
        .to.emit(contracts.hysiBatchZapper, "ZappedIntoBatch")
        .withArgs(parseEther("0.981368248319404492"), depositor.address);

      expect(result)
        .to.emit(contracts.hysiBatchInteraction, "Deposit")
        .withArgs(depositor.address, parseEther("0.981368248319404492"));

      expect(await contracts.usdt.balanceOf(depositor.address)).to.equal(
        BigNumber.from("39303654861")
      );
    });
  });
  describe("zapOutOfBatch", function () {
    it("zaps out of the queue into a stablecoin", async function () {
      const expectedStableAmount = parseEther("37978.521811045440321487");
      //Create Batch
      await contracts.hysiBatchZapper
        .connect(depositor)
        .zapIntoBatch([DepositorInitial, 0, 0], 0);

      const [, batchId] =
        await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
      const shares = await contracts.hysiBatchInteraction.accountBalances(
        batchId,
        depositor.address
      );
      //Actual Test
      const result = await contracts.hysiBatchZapper
        .connect(depositor)
        .zapOutOfBatch(batchId, shares, 0, 0);

      expect(result)
        .to.emit(contracts.hysiBatchZapper, "ZappedOutOfBatch")
        .withArgs(batchId, 0, shares, expectedStableAmount, depositor.address);

      expect(result)
        .to.emit(contracts.hysiBatchInteraction, "WithdrawnFromBatch")
        .withArgs(batchId, shares, depositor.address);

      expect(await contracts.dai.balanceOf(depositor.address)).to.equal(
        expectedStableAmount
      );
    });
  });
  describe("claimAndSwapToStable", function () {
    it("claims batch and swaps into stablecoin", async function () {
      //Create Batch
      await contracts.hysiBatchInteraction
        .connect(depositor)
        .depositForRedeem(parseEther("10"));
      const [, batchId] =
        await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
      timeTravel(1800);
      await contracts.hysiBatchInteraction.connect(owner).batchRedeem(0);

      const amountToReceive = await new HysiBatchInteractionAdapter(
        contracts.hysiBatchInteraction
      ).calculateAmountToReceiveForClaim(batchId, depositor.address);
      const expectedStableAmount =
        await contracts.threePool.calc_withdraw_one_coin(amountToReceive, 0);

      //Actual Test
      const result = await contracts.hysiBatchZapper
        .connect(depositor)
        .claimAndSwapToStable(batchId, 0, 0);

      expect(result)
        .to.emit(contracts.hysiBatchZapper, "ClaimedIntoStable")
        .withArgs(
          batchId,
          0,
          amountToReceive,
          expectedStableAmount,
          depositor.address
        );

      expect(result)
        .to.emit(contracts.hysiBatchInteraction, "Claimed")
        .withArgs(
          depositor.address,
          BatchType.Redeem,
          parseEther("10"),
          amountToReceive
        );

      expect(await contracts.dai.balanceOf(depositor.address)).to.equal(
        expectedStableAmount.add(DepositorInitial)
      );
    });
  });
});
