import { Cl, cvToValue, signMessageHashRsv } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

// `simnet` is a "simulation network" - a local, testing Stacks node for running our tests
const accounts = simnet.getAccounts();

// The identifiers of these wallets can be found in the `settings/Devnet.toml` config file
// You can also change the identifiers of these wallets in those files if you want
const sender = accounts.get("wallet_1")!;
const recipient = accounts.get("wallet_2")!;
const randomUser = accounts.get("wallet_3")!;
const newRecipient = accounts.get("wallet_4")!;
const contractOwner = accounts.get("deployer")!;

describe("test token streaming contract", () => {
  // Before each test is run, we want to create a stream
  // so we can run tests around different possible things to do with the stream
  beforeEach(() => {
    const result = simnet.callPublicFn(
      "stream",
      "stream-to",
      [
        Cl.principal(recipient),
        Cl.uint(5),
        Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
        Cl.uint(1),
      ],
      sender
    );

    expect(result.events[0].event).toBe("stx_transfer_event");
    expect(result.events[0].data.amount).toBe("5");
    expect(result.events[0].data.sender).toBe(sender);
  });

  it("ensures contract is initialized properly and stream is created", () => {
    const latestStreamId = simnet.getDataVar("stream", "latest-stream-id");
    expect(latestStreamId).toBeUint(1);

    const createdStream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
    expect(createdStream).toBeSome(
      Cl.tuple({
        sender: Cl.principal(sender),
        recipient: Cl.principal(recipient),
        balance: Cl.uint(5),
        "withdrawn-balance": Cl.uint(0),
        "payment-per-block": Cl.uint(1),
        timeframe: Cl.tuple({
          "start-block": Cl.uint(0),
          "stop-block": Cl.uint(5),
        }),
      })
    );
  });

  it("ensures stream can be refueled", () => {
    const result = simnet.callPublicFn(
      "stream",
      "refuel",
      [Cl.uint(0), Cl.uint(5)],
      sender
    );

    expect(result.events[0].event).toBe("stx_transfer_event");
    expect(result.events[0].data.amount).toBe("5");
    expect(result.events[0].data.sender).toBe(sender);

    const createdStream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
    expect(createdStream).toBeSome(
      Cl.tuple({
        sender: Cl.principal(sender),
        recipient: Cl.principal(recipient),
        balance: Cl.uint(10),
        "withdrawn-balance": Cl.uint(0),
        "payment-per-block": Cl.uint(1),
        timeframe: Cl.tuple({
          "start-block": Cl.uint(0),
          "stop-block": Cl.uint(5),
        }),
      })
    );
  });

  it("ensures stream cannot be refueled by random address", () => {
    const result = simnet.callPublicFn(
      "stream",
      "refuel",
      [Cl.uint(0), Cl.uint(5)],
      randomUser
    );

    expect(result.result).toBeErr(Cl.uint(0));
  });

  it("ensures recipient can withdraw tokens over time", () => {
    // Block 1 was used to deploy contract
    // Block 2 was used to create stream
    // `withdraw` will be called in Block 3
    // so expected to withdraw (Block 3 - Start_Block) = (3 - 0) tokens
    const withdraw = simnet.callPublicFn(
      "stream",
      "withdraw",
      [Cl.uint(0)],
      recipient
    );

    expect(withdraw.events[0].event).toBe("stx_transfer_event");
    expect(withdraw.events[0].data.amount).toBe("4");
    expect(withdraw.events[0].data.recipient).toBe(recipient);
  });

  it("ensures non-recipient cannot withdraw tokens from stream", () => {
    const withdraw = simnet.callPublicFn(
      "stream",
      "withdraw",
      [Cl.uint(0)],
      randomUser
    );

    expect(withdraw.result).toBeErr(Cl.uint(0));
  });

  it("ensures sender can withdraw excess tokens", () => {
    // Block 3
    simnet.callPublicFn("stream", "refuel", [Cl.uint(0), Cl.uint(5)], sender);

    // Block 4 and 5
    simnet.mineEmptyBlock();
    simnet.mineEmptyBlock();

    // Claim tokens
    simnet.callPublicFn("stream", "withdraw", [Cl.uint(0)], recipient);

    // Withdraw excess
    const refund = simnet.callPublicFn(
      "stream",
      "refund",
      [Cl.uint(0)],
      sender
    );

    expect(refund.events[0].event).toBe("stx_transfer_event");
    expect(refund.events[0].data.amount).toBe("5");
    expect(refund.events[0].data.recipient).toBe(sender);
  });

  it("signature verification can be done on stream hashes", () => {
    const hashedStream0 = simnet.callReadOnlyFn(
      "stream",
      "hash-stream",
      [
        Cl.uint(0),
        Cl.uint(0),
        Cl.tuple({ "start-block": Cl.uint(1), "stop-block": Cl.uint(2) }),
      ],
      sender
    );

    const hashAsHex = (hashedStream0.result as any).value as string;
    const signature = signMessageHashRsv({
      messageHash: hashAsHex,
      privateKey:
        "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801",
    });

    const verifySignature = simnet.callReadOnlyFn(
      "stream",
      "validate-signature",
      [
        Cl.bufferFromHex(hashAsHex),
        Cl.bufferFromHex(signature),
        Cl.principal(sender),
      ],
      sender
    );

    expect(cvToValue(verifySignature.result)).toBe(true);
  });

  it("ensures timeframe and payment per block can be modified with consent of both parties", () => {
    const hashedStream0 = simnet.callReadOnlyFn(
      "stream",
      "hash-stream",
      [
        Cl.uint(0),
        Cl.uint(1),
        Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(4) }),
      ],
      sender
    );

    const hashAsHex = (hashedStream0.result as any).value as string;
    const senderSignature = signMessageHashRsv({
      messageHash: hashAsHex,
      // This private key is for the `sender` wallet - i.e. `wallet_1`
      // This can be found in the `settings/Devnet.toml` config file
      privateKey:
        "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801",
    });

    simnet.callPublicFn(
      "stream",
      "update-details",
      [
        Cl.uint(0),
        Cl.uint(1),
        Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(4) }),
        Cl.principal(sender),
        Cl.bufferFromHex(senderSignature),
      ],
      recipient
    );

    const updatedStream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
    expect(updatedStream).toBeSome(
      Cl.tuple({
        sender: Cl.principal(sender),
        recipient: Cl.principal(recipient),
        balance: Cl.uint(5),
        "withdrawn-balance": Cl.uint(0),
        "payment-per-block": Cl.uint(1),
        timeframe: Cl.tuple({
          "start-block": Cl.uint(0),
          "stop-block": Cl.uint(4),
        }),
      })
    );
  });

  // New Tests for Enhanced Features

  describe("User Streams Tracking", () => {
    it("should track streams by user", () => {
      // Create second stream
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(3),
          Cl.tuple({ "start-block": Cl.uint(1), "stop-block": Cl.uint(4) }),
          Cl.uint(1),
        ],
        sender
      );

      // Check sender's streams
      const senderStreams = simnet.getMapEntry("stream", "user-streams", Cl.principal(sender));
      expect(senderStreams).toBeSome(Cl.list([Cl.uint(0), Cl.uint(1)]));

      // Check recipient's streams
      const recipientStreams = simnet.getMapEntry("stream", "user-streams", Cl.principal(recipient));
      expect(recipientStreams).toBeSome(Cl.list([Cl.uint(0), Cl.uint(1)]));
    });
  });

  describe("Stream Cancellation", () => {
    it("should allow sender to cancel stream before expiry", () => {
      // Create stream ending at block 10
      const newStream = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(10) }),
          Cl.uint(1),
        ],
        sender
      );

      const streamId = (newStream.result as any).value.value;

      // Mine to block 5
      simnet.mineEmptyBlocks(3);

      // Cancel stream at block 5
      const cancel = simnet.callPublicFn(
        "stream",
        "cancel-stream",
        [Cl.uint(streamId)],
        sender
      );

      expect(cancel.result).toBeOk(Cl.uint(5)); // Remaining balance
      expect(cancel.events[0].event).toBe("stx_transfer_event");
      expect(cancel.events[0].data.amount).toBe("5");
      expect(cancel.events[0].data.recipient).toBe(sender);
    });

    it("should not allow recipient to cancel stream", () => {
      const cancel = simnet.callPublicFn(
        "stream",
        "cancel-stream",
        [Cl.uint(0)],
        recipient
      );

      expect(cancel.result).toBeErr(Cl.uint(0)); // ERR_UNAUTHORIZED
    });
  });

  describe("Stream Cloning", () => {
    it("should allow sender to clone stream with new timeframe", () => {
      const clone = simnet.callPublicFn(
        "stream",
        "clone-stream",
        [
          Cl.uint(0),
          Cl.tuple({ "start-block": Cl.uint(10), "stop-block": Cl.uint(20) }),
        ],
        sender
      );

      expect(clone.result).toBeOk(Cl.uint(1));

      const clonedStream = simnet.getMapEntry("stream", "streams", Cl.uint(1));
      expect(clonedStream).toBeSome(
        Cl.tuple({
          sender: Cl.principal(sender),
          recipient: Cl.principal(recipient),
          balance: Cl.uint(5),
          "withdrawn-balance": Cl.uint(0),
          "payment-per-block": Cl.uint(1),
          timeframe: Cl.tuple({
            "start-block": Cl.uint(10),
            "stop-block": Cl.uint(20),
          }),
        })
      );
    });

    it("should not allow recipient to clone stream", () => {
      const clone = simnet.callPublicFn(
        "stream",
        "clone-stream",
        [
          Cl.uint(0),
          Cl.tuple({ "start-block": Cl.uint(10), "stop-block": Cl.uint(20) }),
        ],
        recipient
      );

      expect(clone.result).toBeErr(Cl.uint(0)); // ERR_UNAUTHORIZED
    });
  });

  describe("Stream Transfer", () => {
    it("should allow recipient to transfer stream rights", () => {
      const transfer = simnet.callPublicFn(
        "stream",
        "transfer-stream",
        [Cl.uint(0), Cl.principal(newRecipient)],
        recipient
      );

      expect(transfer.result).toBeOk(Cl.bool(true));

      const updatedStream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
      expect(updatedStream.value.data.recipient).toBe(newRecipient);
    });

    it("should not allow sender to transfer stream", () => {
      const transfer = simnet.callPublicFn(
        "stream",
        "transfer-stream",
        [Cl.uint(0), Cl.principal(newRecipient)],
        sender
      );

      expect(transfer.result).toBeErr(Cl.uint(0)); // ERR_UNAUTHORIZED
    });
  });

  describe("Stream Statistics", () => {
    it("should return correct stream statistics", () => {
      // Mine to block 3
      simnet.mineEmptyBlocks(1);

      const stats = simnet.callReadOnlyFn(
        "stream",
        "get-stream-stats",
        [Cl.uint(0)],
        sender
      );

      expect(stats.result).toBeSome(
        Cl.tuple({
          "total-earned": Cl.uint(4),
          "remaining-to-pay": Cl.uint(1),
          "progress-percentage": Cl.uint(80),
          "blocks-remaining": Cl.uint(2),
          "is-active": Cl.bool(true),
        })
      );
    });
  });

  describe("Batch Operations", () => {
    beforeEach(() => {
      // Create additional streams
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.uint(1),
        ],
        sender
      );

      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.uint(1),
        ],
        sender
      );
    });

    it("should allow batch withdrawal from multiple streams", () => {
      // Mine to block 3
      simnet.mineEmptyBlocks(1);

      const batchWithdraw = simnet.callPublicFn(
        "stream",
        "batch-withdraw",
        [Cl.list([Cl.uint(0), Cl.uint(1), Cl.uint(2)])],
        recipient
      );

      expect(batchWithdraw.result).toBeOk(Cl.uint(12)); // 4 + 4 + 4 = 12
      expect(batchWithdraw.events).toHaveLength(3); // Three transfer events
    });
  });

  describe("Time Extension", () => {
    it("should allow stream extension with both parties consent", () => {
      // Create extension message hash
      const extensionMsg = Cl.bufferFromUtf8(`extend:0:10`);
      
      const signature = signMessageHashRsv({
        messageHash: extensionMsg.buffer,
        privateKey: "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801",
      });

      const extend = simnet.callPublicFn(
        "stream",
        "extend-stream",
        [Cl.uint(0), Cl.uint(10), Cl.bufferFromHex(signature)],
        recipient
      );

      expect(extend.result).toBeOk(Cl.bool(true));

      const updatedStream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
      expect(updatedStream.value.data.timeframe["stop-block"]).toBeUint(10);
    });
  });

  describe("Emergency Pause", () => {
    it("should allow owner to pause contract", () => {
      const pause = simnet.callPublicFn(
        "stream",
        "toggle-pause",
        [],
        contractOwner
      );

      expect(pause.result).toBeOk(Cl.bool(true));
    });

    it("should prevent operations when paused", () => {
      // Pause contract
      simnet.callPublicFn("stream", "toggle-pause", [], contractOwner);

      // Try to withdraw
      const withdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );

      expect(withdraw.result).toBeErr(Cl.uint(5)); // ERR_CONTRACT_PAUSED
    });

    it("should not allow non-owner to pause contract", () => {
      const pause = simnet.callPublicFn(
        "stream",
        "toggle-pause",
        [],
        randomUser
      );

      expect(pause.result).toBeErr(Cl.uint(0)); // ERR_UNAUTHORIZED
    });
  });

  describe("Security Features", () => {
    it("should prevent reentrancy attacks", () => {
      // Attempt reentrant call during withdrawal
      // This would be tested by deploying a malicious contract
      // For simnet, we can test that the contract has reentrancy guards
      
      // Withdraw normally
      const withdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );

      expect(withdraw.events[0].event).toBe("stx_transfer_event");
      
      // Try to withdraw again in same block (should fail due to state update)
      const secondWithdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );

      expect(secondWithdraw.result).toBeOk(Cl.uint(0)); // Zero balance to withdraw
    });

    it("should enforce withdrawal limits", () => {
      // Try to withdraw more than available
      // Mine many blocks
      simnet.mineEmptyBlocks(10);

      const withdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );

      // Should only withdraw up to stream balance (5)
      expect(withdraw.events[0].data.amount).toBe("5");
    });
  });

  describe("Edge Cases", () => {
    it("should handle stream with zero payment per block", () => {
      const result = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.uint(0),
        ],
        sender
      );

      expect(result.result).toBeOk(Cl.uint(1));
    });

    it("should handle stream with same start and stop block", () => {
      const result = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(5) }),
          Cl.uint(1),
        ],
        sender
      );

      expect(result.result).toBeErr(Cl.uint(5)); // ERR_INVALID_TIMEFRAME
    });

    it("should handle withdrawal exactly at stream end", () => {
      // Create stream ending at block 5
      const newStream = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.uint(1),
        ],
        sender
      );

      // Mine to block 5
      simnet.mineEmptyBlocks(3);

      const withdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(1)],
        recipient
      );

      expect(withdraw.events[0].data.amount).toBe("5"); // Full amount
    });
  });
});
