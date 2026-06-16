import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CircuitBreaker, CircuitOpenError } from '../../utils/CircuitBreaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    // Small threshold and timeout for faster testing
    cb = new CircuitBreaker('test-cb', {
      threshold: 3,
      resetTimeoutMs: 100,
      errorRateThreshold: 0.5,
    });
  });

  afterEach(() => {
    cb.destroy();
  });

  it('starts in CLOSED state', () => {
    assert.strictEqual(cb.getState(), 'CLOSED');
    assert.strictEqual(cb.getFailureCount(), 0);
  });

  it('executes function and stays CLOSED on success', async () => {
    const result = await cb.execute(async () => 'success');
    assert.strictEqual(result, 'success');
    assert.strictEqual(cb.getState(), 'CLOSED');
  });

  it('transitions to OPEN after consecutive failures', async () => {
    const errorFn = async () => { throw new Error('fail'); };

    // Failure 1
    await assert.rejects(cb.execute(errorFn), { message: 'fail' });
    assert.strictEqual(cb.getState(), 'CLOSED');
    assert.strictEqual(cb.getFailureCount(), 1);

    // Failure 2
    await assert.rejects(cb.execute(errorFn), { message: 'fail' });
    assert.strictEqual(cb.getFailureCount(), 2);

    // Failure 3 -> OPEN
    await assert.rejects(cb.execute(errorFn), { message: 'fail' });
    assert.strictEqual(cb.getState(), 'OPEN');
    assert.strictEqual(cb.getFailureCount(), 3);

    // Subsequent calls should fail immediately with CircuitOpenError
    await assert.rejects(cb.execute(async () => 'wont run'), (err) => {
      return err instanceof CircuitOpenError && err.message.includes('test-cb');
    });
  });

  it('transitions to HALF_OPEN after reset timeout', async () => {
    const errorFn = async () => { throw new Error('fail'); };
    
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(errorFn));
    }
    assert.strictEqual(cb.getState(), 'OPEN');

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next call should attempt transition to HALF_OPEN
    const result = await cb.execute(async () => 'recovered');
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(cb.getState(), 'CLOSED');
  });

  it('reopens if HALF_OPEN test call fails', async () => {
    const errorFn = async () => { throw new Error('fail'); };
    
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(errorFn));
    }

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Fail the test call
    await assert.rejects(cb.execute(errorFn));
    assert.strictEqual(cb.getState(), 'OPEN');
  });

  it('resets failure count on success', async () => {
    const errorFn = async () => { throw new Error('fail'); };
    
    await assert.rejects(cb.execute(errorFn));
    await assert.rejects(cb.execute(errorFn));
    assert.strictEqual(cb.getFailureCount(), 2);

    await cb.execute(async () => 'success');
    assert.strictEqual(cb.getFailureCount(), 0);
  });

  it('transitions to OPEN based on error rate', async () => {
    cb = new CircuitBreaker('rate-cb', {
        threshold: 10, // High consecutive threshold
        errorRateThreshold: 0.5,
        errorRateWindowMs: 1000
    });

    const errorFn = async () => { throw new Error('fail'); };
    const successFn = async () => 'ok';

    // Mix of success and failure (total 6 calls, 4 fails = 66% error rate)
    await cb.execute(successFn);
    await cb.execute(successFn);
    await assert.rejects(cb.execute(errorFn));
    await assert.rejects(cb.execute(errorFn));
    await assert.rejects(cb.execute(errorFn));
    await assert.rejects(cb.execute(errorFn));

    assert.strictEqual(cb.getState(), 'OPEN');
    assert.ok(cb.getErrorRate() > 0.5);
  });
});
