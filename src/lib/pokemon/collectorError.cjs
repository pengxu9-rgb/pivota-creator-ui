'use strict';

// Shared error vocabulary carries no catalog construction or network capability.
class CollectorCallError extends Error {
  constructor(code,retryable=false) {
    super(code);this.name='CollectorCallError';this.code=code;this.retryable=retryable;
  }
}
module.exports={CollectorCallError};
