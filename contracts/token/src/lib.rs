#![no_std]

//! PLEDGE — a minimal fungible token used by the crowdfund campaign.
//! Implements the slice of the standard token interface the crowdfund needs
//! (`balance`, `transfer`) plus a permissionless testnet `faucet` so anyone
//! can grab demo tokens, and an admin `mint`.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
    Balance(Address),
}

/// Whole tokens handed out per faucet call (decimals = 0 for a clean demo UI).
const FAUCET_AMOUNT: i128 = 1_000;

fn read_balance(e: &Env, addr: &Address) -> i128 {
    e.storage()
        .persistent()
        .get(&DataKey::Balance(addr.clone()))
        .unwrap_or(0)
}

fn write_balance(e: &Env, addr: &Address, amount: i128) {
    e.storage()
        .persistent()
        .set(&DataKey::Balance(addr.clone()), &amount);
}

#[contract]
pub struct Token;

#[contractimpl]
impl Token {
    pub fn initialize(e: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        if e.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Decimals, &decimals);
        e.storage().instance().set(&DataKey::Name, &name);
        e.storage().instance().set(&DataKey::Symbol, &symbol);
    }

    /// Permissionless testnet faucet: mints FAUCET_AMOUNT tokens to `to`.
    /// `to` authorizes so you fund your own account.
    pub fn faucet(e: Env, to: Address) {
        to.require_auth();
        let new_bal = read_balance(&e, &to) + FAUCET_AMOUNT;
        write_balance(&e, &to, new_bal);
        e.events().publish((symbol_short!("faucet"), to), FAUCET_AMOUNT);
    }

    /// Admin-only mint.
    pub fn mint(e: Env, to: Address, amount: i128) {
        assert!(amount > 0, "amount must be positive");
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let new_bal = read_balance(&e, &to) + amount;
        write_balance(&e, &to, new_bal);
        e.events().publish((symbol_short!("mint"), to), amount);
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        read_balance(&e, &id)
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");
        let from_bal = read_balance(&e, &from);
        assert!(from_bal >= amount, "insufficient balance");
        write_balance(&e, &from, from_bal - amount);
        write_balance(&e, &to, read_balance(&e, &to) + amount);
        e.events()
            .publish((symbol_short!("transfer"), from, to), amount);
    }

    pub fn decimals(e: Env) -> u32 {
        e.storage().instance().get(&DataKey::Decimals).unwrap_or(0)
    }

    pub fn name(e: Env) -> String {
        e.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(e: Env) -> String {
        e.storage().instance().get(&DataKey::Symbol).unwrap()
    }
}

mod test;
