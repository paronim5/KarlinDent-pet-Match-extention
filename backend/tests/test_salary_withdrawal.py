from backend.outcome import _evaluate_salary_withdrawal


def test_withdrawal_exact_available():
    decision = _evaluate_salary_withdrawal(100.0, 0.0, 100.0)
    assert decision["allowed"] is True
    assert decision["status"] == "ok"
    assert decision["processed_amount"] == 100.0
    assert decision["available_after"] == 0.0


def test_withdrawal_insufficient_balance():
    decision = _evaluate_salary_withdrawal(100.0, 50.0, 60.0)
    assert decision["allowed"] is False
    assert decision["status"] == "insufficient_balance"
    assert decision["error_code"] == "insufficient_balance"


def test_withdrawal_already_withdrawn():
    decision = _evaluate_salary_withdrawal(100.0, 100.0, 10.0)
    assert decision["allowed"] is False
    assert decision["status"] == "salary_already_withdrawn"
    assert decision["error_code"] == "salary_already_withdrawn"


def test_withdrawal_no_earnings():
    decision = _evaluate_salary_withdrawal(0.0, 0.0, 10.0)
    assert decision["allowed"] is False
    assert decision["status"] == "no_earnings"
    assert decision["error_code"] == "no_earnings"
