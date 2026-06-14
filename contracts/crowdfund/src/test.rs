#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{token, Address, Env};

const DEADLINE: u64 = 12_346;
const GOAL: i128 = 1_000;

struct Fixture<'a> {
    env: Env,
    backer1: Address,
    backer2: Address,
    recipient: Address,
    token: token::Client<'a>,
    cf: CrowdfundClient<'a>,
}

fn setup() -> Fixture<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 12_345); // before deadline

    let admin = Address::generate(&env);
    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);
    let recipient = Address::generate(&env);

    // A real Stellar Asset Contract stands in for the token; it implements the
    // same standard interface (transfer/balance) the crowdfund calls.
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = token::Client::new(&env, &sac.address());
    let token_admin = token::StellarAssetClient::new(&env, &sac.address());
    token_admin.mint(&backer1, &5_000);
    token_admin.mint(&backer2, &5_000);

    let cf = CrowdfundClient::new(&env, &env.register(Crowdfund, ()));
    cf.initialize(&recipient, &sac.address(), &GOAL, &DEADLINE);

    Fixture {
        env,
        backer1,
        backer2,
        recipient,
        token,
        cf,
    }
}

#[test]
fn contribute_moves_tokens_cross_contract() {
    let t = setup();
    t.cf.contribute(&t.backer1, &600);

    assert_eq!(t.token.balance(&t.cf.address), 600);
    assert_eq!(t.token.balance(&t.backer1), 4_400);
    assert_eq!(t.cf.get_raised(), 600);
    assert_eq!(t.cf.pledge_of(&t.backer1), 600);
    assert_eq!(t.cf.get_status(), 0); // running
}

#[test]
fn claim_on_success_after_deadline() {
    let t = setup();
    t.cf.contribute(&t.backer1, &600);
    t.cf.contribute(&t.backer2, &500); // raised 1_100 >= goal 1_000
    t.env.ledger().with_mut(|li| li.timestamp = DEADLINE + 1);

    assert_eq!(t.cf.get_status(), 1); // success
    t.cf.claim();
    assert_eq!(t.token.balance(&t.recipient), 1_100);
    assert_eq!(t.token.balance(&t.cf.address), 0);
    assert!(t.cf.is_claimed());
}

#[test]
fn refund_on_failure_after_deadline() {
    let t = setup();
    t.cf.contribute(&t.backer1, &300); // below goal
    t.env.ledger().with_mut(|li| li.timestamp = DEADLINE + 1);

    assert_eq!(t.cf.get_status(), 2); // expired
    t.cf.refund(&t.backer1);
    assert_eq!(t.token.balance(&t.backer1), 5_000); // made whole
    assert_eq!(t.token.balance(&t.cf.address), 0);
    assert_eq!(t.cf.pledge_of(&t.backer1), 0);
}

#[test]
#[should_panic(expected = "campaign still running")]
fn claim_before_deadline_panics() {
    let t = setup();
    t.cf.contribute(&t.backer1, &1_000);
    t.cf.claim(); // still before deadline
}

#[test]
#[should_panic(expected = "campaign ended")]
fn contribute_after_deadline_panics() {
    let t = setup();
    t.env.ledger().with_mut(|li| li.timestamp = DEADLINE + 1);
    t.cf.contribute(&t.backer1, &100);
}

#[test]
#[should_panic(expected = "goal not met")]
fn claim_without_meeting_goal_panics() {
    let t = setup();
    t.cf.contribute(&t.backer1, &300); // below goal
    t.env.ledger().with_mut(|li| li.timestamp = DEADLINE + 1);
    t.cf.claim();
}

#[test]
#[should_panic(expected = "already claimed")]
fn double_claim_panics() {
    let t = setup();
    t.cf.contribute(&t.backer1, &1_000); // meets goal
    t.env.ledger().with_mut(|li| li.timestamp = DEADLINE + 1);
    t.cf.claim();
    t.cf.claim(); // second claim panics
}

#[test]
#[should_panic(expected = "goal met, no refund")]
fn refund_after_goal_met_panics() {
    let t = setup();
    t.cf.contribute(&t.backer1, &1_000); // meets goal
    t.env.ledger().with_mut(|li| li.timestamp = DEADLINE + 1);
    t.cf.refund(&t.backer1); // not allowed: goal was met
}

#[test]
#[should_panic(expected = "already initialized")]
fn reinitialize_panics() {
    let t = setup();
    t.cf.initialize(&t.recipient, &t.token.address, &GOAL, &DEADLINE);
}
