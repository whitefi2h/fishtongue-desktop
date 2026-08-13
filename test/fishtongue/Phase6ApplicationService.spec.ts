import Phase6ApplicationService from "@/fishtongue/application/services/Phase6ApplicationService";
import { BorrowingBatch, BorrowingCandidate } from "@/fishtongue/domain/models";

const now = "2026-08-13T00:00:00.000Z";

function candidate(
  id: string,
  sourceLexemeId: string,
  sourceForm: string,
  targetForm: string
): BorrowingCandidate {
  return {
    id,
    batchId: "batch",
    sourceLexemeId,
    sourceForm,
    sourceIpa: sourceForm,
    adaptedForm: targetForm,
    adaptedIpa: targetForm,
    partOfSpeech: "noun",
    senses: [{ definition: "meaning", position: 0 }],
    morphemeIds: [],
    trace: [],
    warnings: [],
    explanation: "test",
    status: "accepted",
    position: 0,
  };
}

function fixture(candidates: BorrowingCandidate[]) {
  const batch = {
    id: "batch",
    profileId: "profile",
    sourceLanguageId: "source-language",
    targetLanguageId: "target-language",
    sourceSnapshot: [],
    phonologySnapshot: {},
    profileSnapshot: {},
    snapshotHash: "hash",
    panphonVersion: "test",
    algorithmVersion: "borrowing-adaptation-v1",
    lexurgyStageChain: [],
    status: "draft",
    candidates,
    createdAt: now,
    updatedAt: now,
  } as BorrowingBatch;
  const commit = jest.fn().mockResolvedValue({
    lexemeIds: candidates.map((value) => `${value.id}:lexeme`),
    relationIds: candidates.map((value) => `${value.id}:relation`),
  });
  const history = {
    checkBorrowingDuplicate: jest.fn().mockResolvedValue({ kind: "none" }),
  };
  const service = new Phase6ApplicationService(
    {} as never,
    {} as never,
    { get: jest.fn().mockResolvedValue(batch) } as never,
    {} as never,
    jest.fn().mockResolvedValue(undefined),
    {} as never,
    { commit } as never,
    {} as never,
    history as never
  );
  return { service, history, commit };
}

test("batch borrowing requires confirmation for a repeated source with a different form", async () => {
  const { service, history, commit } = fixture([
    candidate("candidate-a", "source-a", "bagu", "paku"),
  ]);
  history.checkBorrowingDuplicate.mockResolvedValue({
    kind: "same_source_different_target",
    conflictingTargetForm: "baku",
    targetForm: "paku",
  });

  await expect(
    service.commitBorrowing("batch", ["candidate-a"])
  ).rejects.toThrow("请确认后再保存");
  expect(commit).not.toHaveBeenCalled();

  await service.commitBorrowing(
    "batch",
    ["candidate-a"],
    { confirmSameSource: true }
  );
  expect(commit).toHaveBeenCalledWith("batch", ["candidate-a"]);
});

test("batch borrowing blocks identical forms even after confirmation and checks the batch itself", async () => {
  const { service, commit } = fixture([
    candidate("candidate-a", "source-a", "bagu", "paku"),
    candidate("candidate-b", "source-a", "bagu", "PAKU"),
  ]);

  const duplicate = await service.checkBorrowingDuplicates("batch", [
    "candidate-a",
    "candidate-b",
  ]);
  expect(duplicate.kind).toBe("same_source_same_target_form");
  expect(duplicate.conflicts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        candidateId: "candidate-b",
        conflictingTargetForm: "paku",
        targetForm: "PAKU",
      }),
    ])
  );

  await expect(
    service.commitBorrowing(
      "batch",
      ["candidate-a", "candidate-b"],
      { confirmSameSource: true }
    )
  ).rejects.toThrow("不能保存");
  expect(commit).not.toHaveBeenCalled();
});
