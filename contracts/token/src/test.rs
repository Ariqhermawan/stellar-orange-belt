#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

#[test]
fn faucet_then_balance() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let token = TokenClient::new(&e, &e.register(Token, ()));
    token.initialize(
        &admin,
        &0u32,
        &String::from_str(&e, "Pledge"),
        &String::from_str(&e, "PLG"),
    );

    let user = Address::generate(&e);
    assert_eq!(token.balance(&user), 0);
    token.faucet(&user);
    assert_eq!(token.balance(&user), 1_000);
}

#[test]
fn transfer_moves_tokens() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let token = TokenClient::new(&e, &e.register(Token, ()));
    token.initialize(
        &admin,
        &0u32,
        &String::from_str(&e, "Pledge"),
        &String::from_str(&e, "PLG"),
    );

    let a = Address::generate(&e);
    let b = Address::generate(&e);
    token.faucet(&a);
    token.transfer(&a, &b, &400);
    assert_eq!(token.balance(&a), 600);
    assert_eq!(token.balance(&b), 400);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn transfer_insufficient_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let token = TokenClient::new(&e, &e.register(Token, ()));
    token.initialize(
        &admin,
        &0u32,
        &String::from_str(&e, "Pledge"),
        &String::from_str(&e, "PLG"),
    );

    let a = Address::generate(&e);
    let b = Address::generate(&e);
    token.faucet(&a); // 1_000
    token.transfer(&a, &b, &2_000); // panics
}
