use thiserror::Error;

#[derive(Error, Debug)]
pub enum RecoveryError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("scan cancelled")]
    Cancelled,
    #[error("{0}")]
    Msg(String),
}

pub type Result<T> = std::result::Result<T, RecoveryError>;
