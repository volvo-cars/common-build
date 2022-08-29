module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: "tests",
    //    setupFiles: ['dotenv/config'],
    maxWorkers: 1,
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']
};