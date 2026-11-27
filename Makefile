.PHONY: setup dev-backend dev-frontend eval

setup:
	cd backend && python -m pip install -r requirements.txt
	cd frontend && npm install

dev-backend:
	cd backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-frontend:
	cd frontend && npm run dev

eval:
	cd backend && python app/evals/eval_citations.py

