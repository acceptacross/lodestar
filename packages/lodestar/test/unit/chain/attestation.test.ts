import sinon, {SinonStubbedInstance} from "sinon";
import {expect} from "chai";
import {AttestationProcessor} from "../../../src/chain/attestation";
import {BeaconChain, ILMDGHOST, StatefulDagLMDGHOST} from "../../../src/chain";
import {config} from "@chainsafe/lodestar-config/lib/presets/mainnet";
import * as utils from "@chainsafe/lodestar-beacon-state-transition/lib/util/attestation";
import {BlockRepository, StateRepository} from "../../../src/db/api/beacon/repositories";
import {WinstonLogger} from "@chainsafe/lodestar-utils/lib/logger";
import {generateEmptySignedBlock} from "../../utils/block";
import {generateEmptyAttestation} from "../../utils/attestation";
import {generateState} from "../../utils/state";
import {generateValidators} from "../../utils/validator";
import {fail} from "assert";
import {Checkpoint} from "@chainsafe/lodestar-types";

describe("AttestationProcessor", function () {
  const sandbox = sinon.createSandbox();
  let attestationProcessor: AttestationProcessor;
  let chainStub: any, forkChoiceStub: SinonStubbedInstance<ILMDGHOST>, dbStub: any, logger: any,
    processAttestationStub: any, getAttestingIndicesStub: any;

  beforeEach(() => {
    chainStub = sandbox.createStubInstance(BeaconChain);
    forkChoiceStub = sandbox.createStubInstance(StatefulDagLMDGHOST);
    dbStub = {
      state: sandbox.createStubInstance(StateRepository),
      block: sandbox.createStubInstance(BlockRepository),
    };
    logger = new WinstonLogger();
    logger.silent = true;
    attestationProcessor = new AttestationProcessor(chainStub, forkChoiceStub, {config, db: dbStub, logger});
    getAttestingIndicesStub = sandbox.stub(utils, "getAttestingIndices");
  });

  afterEach(() => {
    sandbox.restore();
    logger.silent = false;
  });

  it("receiveAttestation - should process attestation after receiveAttestation", async () => {
    processAttestationStub = sandbox.stub(attestationProcessor, "processAttestation");
    const attestation = generateEmptyAttestation();
    const block = generateEmptySignedBlock();
    const state = generateState();
    dbStub.block.get.resolves(block);
    dbStub.state.get.resolves(state);
    dbStub.block.has.resolves(true);
    await attestationProcessor.receiveAttestation(attestation);
    expect(processAttestationStub.calledOnce).to.be.true;
  });

  it("receiveAttestation - should not process attestation after receiveAttestation - block not exist", async () => {
    processAttestationStub = sandbox.stub(attestationProcessor, "processAttestation");
    const attestation = generateEmptyAttestation();
    const block = generateEmptySignedBlock();
    const state = generateState();
    dbStub.block.get.resolves(block);
    dbStub.state.get.resolves(state);
    dbStub.block.has.resolves(false);
    await attestationProcessor.receiveAttestation(attestation);
    expect(processAttestationStub.calledOnce).to.be.false;
  });

  it("processAttestation - should not call forkChoice - invalid target epoch", async () => {
    try {
      const attestation = generateEmptyAttestation();
      attestation.data.target.epoch = 2019;
      const attestationHash = config.types.Attestation.hashTreeRoot(attestation);
      const block = generateEmptySignedBlock();
      dbStub.block.get.resolves(block);
      const state = generateState();
      dbStub.state.get.resolves(state);
      forkChoiceStub.getJustified.returns({} as Checkpoint);

      await attestationProcessor.processAttestation(attestation, attestationHash);
      fail("expect an AssertionError");
    } catch (err) {
      expect(getAttestingIndicesStub.called).to.be.false;
      expect(forkChoiceStub.addAttestation.called).to.be.false;
    }
  });

  it("processAttestation - should not call forkChoice - invalid block slot", async () => {
    try {
      const attestation = generateEmptyAttestation();
      const attestationHash = config.types.Attestation.hashTreeRoot(attestation);
      const block = generateEmptySignedBlock();
      block.message.slot = 1;
      dbStub.block.get.resolves(block);
      const state = generateState();
      dbStub.state.get.resolves(state);
      forkChoiceStub.getJustified.returns({} as Checkpoint);

      await attestationProcessor.processAttestation(attestation, attestationHash);
      fail("expect an AssertionError");
    } catch (err) {
      expect(getAttestingIndicesStub.called).to.be.false;
      expect(forkChoiceStub.addAttestation.called).to.be.false;
    }
  });

  it("processAttestation - should call forkChoice", async () => {
    const attestation = generateEmptyAttestation();
    const attestationHash = config.types.Attestation.hashTreeRoot(attestation);
    const block = generateEmptySignedBlock();
    dbStub.block.get.resolves(block);
    const state = generateState();
    state.genesisTime = state.genesisTime - config.params.SECONDS_PER_SLOT;
    dbStub.state.getJustified.resolves(state);
    forkChoiceStub.getJustified.returns(config.types.Checkpoint.defaultValue());
    forkChoiceStub.headBlockSlot.returns(0);
    getAttestingIndicesStub.returns([0]);
    state.balances = [];
    state.validators = generateValidators(3, {});

    await attestationProcessor.processAttestation(attestation, attestationHash);
    expect(getAttestingIndicesStub.called).to.be.true;
    expect(forkChoiceStub.addAttestation.called).to.be.true;
  });
});
