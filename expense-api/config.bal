import ballerina/os;

// The expense-db platform resource (postgres-cnpg). Names come verbatim from
// design.json's envBindings — never renamed, never invented. Every one has a
// sensible default so the service starts with no environment variables set at
// all, per the component contract.
configurable string dbHost = os:getEnv("EXPENSE_DB_HOST");
configurable string dbPortRaw = os:getEnv("EXPENSE_DB_PORT");
configurable string dbName = os:getEnv("EXPENSE_DB_DBNAME");
configurable string dbUser = os:getEnv("EXPENSE_DB_USER");
configurable string dbPassword = os:getEnv("EXPENSE_DB_PASSWORD");

final string resolvedDbHost = dbHost.trim() == "" ? "localhost" : dbHost;
final int resolvedDbPort = resolvePort(dbPortRaw);
final string resolvedDbName = dbName.trim() == "" ? "postgres" : dbName;
final string resolvedDbUser = dbUser.trim() == "" ? "postgres" : dbUser;
final string resolvedDbPassword = dbPassword.trim() == "" ? "postgres" : dbPassword;

function resolvePort(string raw) returns int {
    int|error parsed = int:fromString(raw.trim());
    if parsed is int {
        return parsed;
    }
    return 5432;
}
