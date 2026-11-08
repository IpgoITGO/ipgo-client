import type { DecisionRequest, Preview, Review } from '../model/receiptApi'
export const version = 'a'.repeat(64)
export const saved = {
  decisionId: 'saved-1',
  currentState: 'RESOLVED',
  version: 'b'.repeat(64),
  runId: null,
}
export const allocations = [
  {
    receiptId: 11,
    quantity: 80,
    skuName: '합성입고상품',
    receivedOn: '2026-11-08',
  },
  {
    receiptId: 12,
    quantity: 80,
    skuName: '합성입고상품',
    receivedOn: '2026-11-08',
  },
]
export function makeReview(changes: Partial<Review> = {}): Review {
  return structuredClone({
    reviewId: 1,
    warehouseId: 1,
    productId: 7,
    skuName: '합성입고상품',
    stockDate: '2026-11-08',
    currentState: 'OPEN',
    version,
    sourceReady: true,
    originalSource: {
      uploadId: 8,
      revision: 1,
      present: true,
      quantity: 160,
      valid: true,
      fingerprint: 'original',
    },
    currentSource: {
      uploadId: 9,
      revision: 2,
      present: true,
      quantity: 200,
      valid: true,
      fingerprint: 'current',
    },
    allocations,
    candidates: [
      {
        receiptId: 11,
        quantity: 80,
        expectedOn: '2026-11-08',
        status: 'RECEIVED',
        selectable: true,
      },
      {
        receiptId: 12,
        quantity: 80,
        expectedOn: '2026-11-08',
        status: 'RECEIVED',
        selectable: true,
      },
      {
        receiptId: 13,
        quantity: 100,
        expectedOn: '2026-11-09',
        status: 'PLANNED',
        selectable: true,
      },
      {
        receiptId: 14,
        quantity: 80,
        expectedOn: null,
        status: 'PLANNED',
        selectable: false,
      },
    ],
    capabilities: { keep: true, replace: true, clear: true },
    warnings: ['SOURCE_CHANGED'],
    lastDecision: null,
    decisions: [],
    ...changes,
  })
}
export function makePreview(
  request: DecisionRequest | Omit<DecisionRequest, 'reason' | 'idempotencyKey'>,
): Preview {
  const keep = request.action === 'KEEP'
  return {
    version: request.expectedVersion,
    action: request.action,
    before: allocations,
    after: keep
      ? allocations
      : request.receiptIds.length
        ? [
            {
              receiptId: 13,
              quantity: 100,
              skuName: '합성입고상품',
              receivedOn: '2026-11-08',
            },
          ]
        : [],
    changes: keep
      ? []
      : [
          {
            receiptId: 11,
            beforeStatus: 'RECEIVED',
            afterStatus: 'PLANNED',
            beforeReflected: false,
            afterReflected: true,
          },
          {
            receiptId: 12,
            beforeStatus: 'RECEIVED',
            afterStatus: 'PLANNED',
            beforeReflected: false,
            afterReflected: true,
          },
          ...(request.receiptIds.length
            ? [
                {
                  receiptId: 13,
                  beforeStatus: 'PLANNED',
                  afterStatus: 'RECEIVED',
                  beforeReflected: true,
                  afterReflected: false,
                },
              ]
            : []),
        ],
    warnings: ['SOURCE_CHANGED'],
    mayRecalculate: !keep,
  }
}
