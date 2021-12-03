import {
  StreamingFeeModule,
  StreamingFeeModule__factory,
} from "@setprotocol/set-protocol-v2/dist/typechain";
import { Address } from "packages/utils/src/types";
import { Configuration } from "./Configuration";

export default class StreamingFeeModuleManager {
  private contract: StreamingFeeModule;

  constructor(private configuration: Configuration) {
    this.contract = StreamingFeeModule__factory.connect(
      this.configuration.core.modules.StreamingFeeModule.address,
      this.configuration.manager
    );
  }

  async initialize(
    setToken: Address,
    settings?: Configuration["core"]["modules"]["StreamingFeeModule"]["config"]
  ) {
    settings =
      settings || this.configuration.core.modules.StreamingFeeModule.config;
    console.log(
      "initializing StreamingFeeModule",
      JSON.stringify(settings, null, 2)
    );
    return this.contract.initialize(setToken, settings);
  }
}

export { StreamingFeeModuleManager };
