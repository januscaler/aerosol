//! Lightweight on-device “AI” suggestions: deterministic scoring from path/size signals.
//! Swappable for ONNX / embeddings later without changing the pipeline surface.

mod heuristic;

pub use heuristic::HeuristicClassifier;
