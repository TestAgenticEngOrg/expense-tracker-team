import ballerina/http;
import ballerina/jwt;
import ballerina/lang.array;
import ballerina/test;

// Exercises the copied `gateway_assertion.bal` against a throwaway RSA
// keypair — never a real gateway or IdP. `GATEWAY_ASSERTION_CERTIFICATE`,
// `GATEWAY_ASSERTION_ISSUER` and `GATEWAY_ASSERTION_HEADER` are exported by
// the test runner before `bal test` starts, so the interceptor is in its
// verifying mode for the whole run.
//
// `tests/resources/primary_cert.pem` is the certificate those three env vars
// point at; `primary_key_pkcs8.pem` is its matching private key, used here to
// mint assertions the interceptor should accept. `other_key_pkcs8.pem` is a
// second, unrelated keypair used only to prove a wrongly-signed assertion is
// refused.

const string TEST_ISSUER = "expense-api-test-gateway";
const string TEST_HEADER = "x-jwt-assertion";
const string PRIMARY_KEY_FILE = "tests/resources/primary_key_pkcs8.pem";
const string OTHER_KEY_FILE = "tests/resources/other_key_pkcs8.pem";

final http:Client testClient = check new ("http://localhost:9090");

function mintAssertion(string keyFile, string subject) returns string {
    jwt:IssuerConfig issuerConfig = {
        issuer: TEST_ISSUER,
        username: subject,
        expTime: 300,
        customClaims: {"scope": "expenses:read expenses:submit", "username": subject, "ouHandle": "acme"},
        signatureConfig: {
            algorithm: jwt:RS256,
            config: {keyFile: keyFile, keyPassword: ""}
        }
    };
    string|jwt:Error token = jwt:issue(issuerConfig);
    if token is jwt:Error {
        test:assertFail("could not mint test assertion: " + token.message());
    }
    return token;
}

// Base64URL (no padding) -> bytes, the JWT segment encoding.
function decodeSegment(string segment) returns byte[]|error {
    string padded = segment;
    int remainder = padded.length() % 4;
    if remainder == 2 {
        padded = padded + "==";
    } else if remainder == 3 {
        padded = padded + "=";
    }
    string standard = re `-`.replaceAll(padded, "+");
    standard = re `_`.replaceAll(standard, "/");
    return array:fromBase64(standard);
}

// bytes -> Base64URL (no padding), the JWT segment encoding.
function encodeSegment(byte[] content) returns string {
    string standard = array:toBase64(content);
    string urlSafe = re `\+`.replaceAll(standard, "-");
    urlSafe = re `/`.replaceAll(urlSafe, "_");
    urlSafe = re `=+$`.replaceAll(urlSafe, "");
    return urlSafe;
}

// Flips the assertion's subject after signing, keeping the original
// signature — proof the interceptor re-verifies rather than trusting the
// payload it decodes.
function tamperPayload(string token, string originalSubject, string tamperedSubject) returns string {
    string[] parts = re `\.`.split(token);
    byte[]|error payloadBytes = decodeSegment(parts[1]);
    if payloadBytes is error {
        test:assertFail("could not decode assertion payload for tampering");
    }
    string|error payloadText = string:fromBytes(payloadBytes);
    if payloadText is error {
        test:assertFail("assertion payload was not valid UTF-8");
    }
    int? idx = payloadText.indexOf(originalSubject);
    if idx is () {
        test:assertFail("original subject not found in assertion payload");
    }
    string tamperedText = payloadText.substring(0, idx) + tamperedSubject
        + payloadText.substring(idx + originalSubject.length());
    string tamperedSegment = encodeSegment(tamperedText.toBytes());
    return parts[0] + "." + tamperedSegment + "." + parts[2];
}

@test:Config {}
function testValidAssertionIsAccepted() returns error? {
    string token = mintAssertion(PRIMARY_KEY_FILE, "employee-001");
    http:Response response = check testClient->get("/me/expenses", {[TEST_HEADER]: token});
    // The interceptor let it through — whatever the handler answers (200 with
    // an empty page, or 500 if expense-db is not reachable in this run) is
    // NOT the interceptor refusing the caller.
    test:assertNotEquals(response.statusCode, 401, "a validly signed assertion must not be refused");
}

@test:Config {}
function testWrongKeySignatureIsRejected() returns error? {
    string token = mintAssertion(OTHER_KEY_FILE, "employee-002");
    http:Response response = check testClient->get("/me/expenses", {[TEST_HEADER]: token});
    test:assertEquals(response.statusCode, 401, "an assertion signed by a different key must be refused");
}

@test:Config {}
function testTamperedPayloadIsRejected() returns error? {
    string token = mintAssertion(PRIMARY_KEY_FILE, "employee-003");
    string tampered = tamperPayload(token, "employee-003", "employee-999");
    http:Response response = check testClient->get("/me/expenses", {[TEST_HEADER]: tampered});
    test:assertEquals(response.statusCode, 401, "a payload edited after signing must be refused, never treated as anonymous");
}

@test:Config {}
function testPublicHealthNeedsNoAssertion() returns error? {
    http:Response response = check testClient->get("/health");
    test:assertEquals(response.statusCode, 200, "a security: [] operation must answer with no assertion at all");
}
