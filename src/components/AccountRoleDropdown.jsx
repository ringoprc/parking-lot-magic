import { createElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiChevronDown, FiShield, FiUser, FiUserX } from 'react-icons/fi';
import './AccountRoleDropdown.css';

const roles = [
  { value: 'none', label: '未授權', description: '僅可瀏覽後台頁面架構', Icon: FiUserX },
  { value: 'admin', label: '管理員', description: '管理後台與成員帳號權限', Icon: FiShield },
  { value: 'staff', label: '內勤', description: '使用後台，無法變更帳號權限', Icon: FiUser },
];

export default function AccountRoleDropdown({ value, label, disabled, onChange }) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const options = useRef([]);
  const id = useId();
  const selected = roles.find(role => role.value === value) || roles[0];
  const open = !!position && !disabled;

  function close(restoreFocus = false) {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  }
  function show() {
    if (disabled) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(296, window.innerWidth - 24);
    setPosition({
      width,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      ...(window.innerHeight - rect.bottom >= 244
        ? { top: rect.bottom + 8 }
        : { bottom: Math.max(12, window.innerHeight - rect.top + 8) }),
    });
  }
  useEffect(() => {
    if (!open) return;
    options.current[roles.findIndex(role => role.value === selected.value)]?.focus();
    function outside(event) {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    }
    const dismiss = () => setPosition(null);
    function scroll(event) {
      if (!menu.current?.contains(event.target)) dismiss();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open, selected.value]);

  function navigate(event) {
    const current = options.current.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % roles.length;
    if (event.key === 'ArrowUp') next = (current + roles.length - 1) % roles.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = roles.length - 1;
    if (next !== undefined) { event.preventDefault(); options.current[next]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    // Restore the anchor before allowing Tab to move through the page normally.
    if (event.key === 'Tab') close(true);
  }

  return <>
    <button ref={trigger} type="button" className={`account-role-trigger role-${selected.value}`}
      disabled={disabled} aria-label={`${label}：${selected.label}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined}
      onClick={() => open ? close() : show()}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); show(); } }}>
      <span className="account-role-dot" aria-hidden="true" /><span>{selected.label}</span><FiChevronDown aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={id} className="account-role-menu" style={position}
      role="menu" aria-label={label} onKeyDown={navigate}>
      <div className="account-role-menu-title" role="presentation">設定帳號權限</div>
      {roles.map(({ value: role, label: name, description, Icon }, index) => <button
        key={role} ref={element => { options.current[index] = element; }} type="button"
        role="menuitemradio" aria-checked={role === selected.value} tabIndex={-1}
        className={`account-role-option role-${role}${role === selected.value ? ' is-selected' : ''}`}
        onClick={() => { close(true); if (role !== selected.value) onChange(role); }}>
        <span className="account-role-icon">{createElement(Icon, { 'aria-hidden': true })}</span>
        <span className="account-role-copy"><strong>{name}</strong><small>{description}</small></span>
        {role === selected.value && <FiCheck className="account-role-check" aria-hidden="true" />}
      </button>)}
    </div>, document.body)}
  </>;
}
