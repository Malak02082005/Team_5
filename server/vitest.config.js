import { defineConfig } from 'vitest/config';

// Test files run one after another, because several of them use the same uploads folder.
export default defineConfig({
    test: {
        fileParallelism: false
    }
});
//Vitest normally runs test files at the same time. 
// (s3ands2) and s8's test files use uploads/lender-documents and clean up after themselves, 
// so running together they delete each other's files and fail randomly. 
// This makes them run one at a time