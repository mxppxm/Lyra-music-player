use keyring::Entry;

const SERVICE: &str = "com.daoyu.lyra";

fn entry(key: &str) -> Result<Entry, keyring::Error> {
    Entry::new(SERVICE, key)
}

pub fn set_secret(key: &str, value: &str) -> Result<(), keyring::Error> {
    entry(key)?.set_password(value)
}

pub fn get_secret(key: &str) -> Result<Option<String>, keyring::Error> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn delete_secret(key: &str) -> Result<(), keyring::Error> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e),
    }
}
