document.querySelectorAll('.accordion-head').forEach(button => {
  button.addEventListener('click', () => {
    const section = button.closest('.accordion');
    section.classList.toggle('open');
    button.querySelector('span').textContent = section.classList.contains('open') ? '⌃' : '⌄';
  });
});

document.querySelectorAll('.switch').forEach(button => {
  button.addEventListener('click', () => button.classList.toggle('on'));
});

document.querySelectorAll('.filters button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
  });
});
