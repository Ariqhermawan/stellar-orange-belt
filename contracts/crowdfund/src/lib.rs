#![no_std]

//! Crowdfund campaign contract. It holds a goal + deadline and accepts
//! contributions in a token by making a CROSS-CONTRACT call to that token
//! (`token.transfer(contributor -> this contract)`). The contributor's single
//! signature authorizes both this `contribute` call and the nested token
//! `transfer` (Soroban's authorized-invocation tree).
//!
//! - Success (deadline passed, goal met): the recipient `claim`s the pot. The
//!   contract pays out from its OWN address, so no extra signature is needed.
//! - Failure (deadline passed, goal missed): each contributor can `refund`.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Recipient,
    Token,
    Goal,
    Deadline,
    Raised,
    Claimed,
    Pledge(Address),
}

fn raised(e: &Env) -> i128 {
    e.storage().instance().get(&DataKey::Raised).unwrap_or(0)
}
fn goal(e: &Env) -> i128 {
    e.storage().instance().get(&DataKey::Goal).unwrap()
}
fn deadline(e: &Env) -> u64 {
    e.storage().instance().get(&DataKey::Deadline).unwrap()
}
fn token_client(e: &Env) -> token::Client<'_> {
    let addr: Address = e.storage().instance().get(&DataKey::Token).unwrap();
    token::Client::new(e, &addr)
}

#[contract]
pub struct Crowdfund;

#[contractimpl]
impl Crowdfund {
    pub fn initialize(e: Env, recipient: Address, token: Address, goal: i128, deadline: u64) {
        if e.storage().instance().has(&DataKey::Recipient) {
            panic!("already initialized");
        }
        assert!(goal > 0, "goal must be positive");
        e.storage().instance().set(&DataKey::Recipient, &recipient);
        e.storage().instance().set(&DataKey::Token, &token);
        e.storage().instance().set(&DataKey::Goal, &goal);
        e.storage().instance().set(&DataKey::Deadline, &deadline);
        e.storage().instance().set(&DataKey::Raised, &0i128);
        e.storage().instance().set(&DataKey::Claimed, &false);
    }

    /// Contribute `amount` tokens. Cross-contract: pulls tokens from `from`
    /// into this contract. `from.require_auth()` here + the token's own auth in
    /// `transfer` are both satisfied by the contributor's single signature.
    pub fn contribute(e: Env, from: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(e.ledger().timestamp() < deadline(&e), "campaign ended");

        token_client(&e).transfer(&from, &e.current_contract_address(), &amount);

        let new_raised = raised(&e) + amount;
        e.storage().instance().set(&DataKey::Raised, &new_raised);
        let prev: i128 = e
            .storage()
            .instance()
            .get(&DataKey::Pledge(from.clone()))
            .unwrap_or(0);
        e.storage()
            .instance()
            .set(&DataKey::Pledge(from.clone()), &(prev + amount));

        e.events().publish((symbol_short!("contrib"), from), amount);
        if new_raised >= goal(&e) {
            e.events().publish((symbol_short!("goalmet"),), new_raised);
        }
    }

    /// Recipient claims the pot after a successful campaign. The contract pays
    /// out from its own address (auto-authorized), so only the recipient's
    /// outer auth is required as an access-control gate.
    pub fn claim(e: Env) {
        assert!(
            e.ledger().timestamp() >= deadline(&e),
            "campaign still running"
        );
        let r = raised(&e);
        assert!(r >= goal(&e), "goal not met");
        let claimed: bool = e.storage().instance().get(&DataKey::Claimed).unwrap_or(false);
        assert!(!claimed, "already claimed");

        let recipient: Address = e.storage().instance().get(&DataKey::Recipient).unwrap();
        recipient.require_auth();
        e.storage().instance().set(&DataKey::Claimed, &true);

        token_client(&e).transfer(&e.current_contract_address(), &recipient, &r);
        e.events().publish((symbol_short!("claimed"), recipient), r);
    }

    /// Refund a contributor after a failed campaign. Zeroes the pledge before
    /// the transfer (effects-before-interactions).
    pub fn refund(e: Env, from: Address) {
        from.require_auth();
        assert!(
            e.ledger().timestamp() >= deadline(&e),
            "campaign still running"
        );
        assert!(raised(&e) < goal(&e), "goal met, no refund");
        let owed: i128 = e
            .storage()
            .instance()
            .get(&DataKey::Pledge(from.clone()))
            .unwrap_or(0);
        assert!(owed > 0, "nothing to refund");

        e.storage()
            .instance()
            .set(&DataKey::Pledge(from.clone()), &0i128);
        token_client(&e).transfer(&e.current_contract_address(), &from, &owed);
        e.events().publish((symbol_short!("refund"), from), owed);
    }

    // ---- read-only getters (called via simulation, no fee) ----

    pub fn get_raised(e: Env) -> i128 {
        raised(&e)
    }
    pub fn get_goal(e: Env) -> i128 {
        goal(&e)
    }
    pub fn get_deadline(e: Env) -> u64 {
        deadline(&e)
    }
    pub fn get_recipient(e: Env) -> Address {
        e.storage().instance().get(&DataKey::Recipient).unwrap()
    }
    pub fn get_token(e: Env) -> Address {
        e.storage().instance().get(&DataKey::Token).unwrap()
    }
    pub fn is_claimed(e: Env) -> bool {
        e.storage().instance().get(&DataKey::Claimed).unwrap_or(false)
    }
    pub fn pledge_of(e: Env, who: Address) -> i128 {
        e.storage().instance().get(&DataKey::Pledge(who)).unwrap_or(0)
    }

    /// 0 = Running, 1 = Success, 2 = Expired.
    pub fn get_status(e: Env) -> u32 {
        if e.ledger().timestamp() < deadline(&e) {
            0
        } else if raised(&e) >= goal(&e) {
            1
        } else {
            2
        }
    }
}

mod test;
