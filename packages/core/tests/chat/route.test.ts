import { describe, expect, it } from "vitest";
import { addressed } from "../../src/index.js";

const works = new Map([["TBO-1", "t1"], ["TBO-2", "t2"]]);
const filed = new Map([["501", "t1"]]);
const addressing = { threadOfMessage: (id: string) => filed.get(id), threadOfWork: (id: string) => works.get(id) };

describe("a message in a chat without threads is addressed, not guessed", () => {
  it("reaches the work whose message it quotes", () => {
    expect(addressed({ text: "go ahead", quotes: "501" }, addressing)).toEqual({ to: "work", thread: "t1", text: "go ahead" });
  });

  it("reaches the work its id names at its start, the id taken off", () => {
    expect(addressed({ text: "TBO-2: ship it" }, addressing)).toEqual({ to: "work", thread: "t2", text: "ship it" });
    expect(addressed({ text: "  TBO-2:" }, addressing)).toEqual({ to: "work", thread: "t2", text: "" });
  });

  it("is the chat's when it names no work, or names one amy does not know", () => {
    expect(addressed({ text: "how is the api project going?" }, addressing)).toEqual({ to: "chat", text: "how is the api project going?" });
    expect(addressed({ text: "TBO-9: hi" }, addressing)).toEqual({ to: "chat", text: "TBO-9: hi" });
    expect(addressed({ text: "TBO-2:x" }, addressing)).toEqual({ to: "chat", text: "TBO-2:x" });
  });

  it("says so when it quotes a message amy filed under no work", () => {
    expect(addressed({ text: "and this?", quotes: "777" }, addressing)).toEqual({ to: "chat", text: "and this?", unaddressed: true });
  });

  it("asks, rather than routing by an id after it, when the quote reached no work", () => {
    expect(addressed({ text: "TBO-2: /decide ship it", quotes: "777" }, addressing)).toEqual({ to: "chat", text: "TBO-2: /decide ship it", unaddressed: true });
  });

  it("prefers the quote to an id at the start", () => {
    expect(addressed({ text: "TBO-2: no, this one", quotes: "501" }, addressing)).toMatchObject({ to: "work", thread: "t1" });
  });
});
